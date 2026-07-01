/**
 * State-Space Strength Model - Recursive Bayesian tracking of latent strength.
 *
 * Tracks a person's "current strength" as a hidden state that evolves over time,
 * fusing a stream of noisy per-set strength observations (e.g. estimated 1RM /
 * e1RM from {@link StrengthEstimate}) into a smoothed estimate plus uncertainty.
 *
 * Model choice — local linear trend (a two-state Kalman filter):
 *
 *   state  x = [ level, trend ]ᵀ    level = latent strength, trend = change/step
 *   x_k = F x_{k-1} + w,   F = [[1, 1], [0, 1]],   w ~ N(0, Q)
 *   z_k = H x_k     + v,   H = [1, 0],             v ~ N(0, R)
 *
 * Why this model and not a plain random walk? Strength has momentum: across a
 * training block it drifts up (or down) rather than jittering around a fixed
 * point. Carrying an explicit `trend` state lets the filter extrapolate that
 * drift, so the estimate leads a rising signal instead of always lagging it —
 * which is exactly the "readiness / trajectory" signal we want. It is still
 * trivial linear algebra: the state is 2×1 and every matrix is 2×2 at most, so
 * each `update` is a fixed number of scalar operations (O(1), no allocations in
 * the hot path beyond the returned snapshot).
 *
 * Observation noise R can be supplied per observation (e.g. derived from an
 * e1RM confidence score) or defaulted from construction. Process noise Q is
 * diagonal — kept simple and defensible rather than the fully-correlated
 * integrated-random-walk form; the two knobs (level vs trend) are easy to reason
 * about and tune.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A snapshot of the latent strength state after an update.
 */
export interface StrengthState {
  /** Latent strength level estimate (the smoothed "current strength"). */
  readonly estimate: number;
  /** Variance of the level estimate (uncertainty; smaller = more confident). */
  readonly variance: number;
  /** Estimated strength change per observation step (drift/trajectory). */
  readonly trend: number;
  /** Variance of the trend estimate. */
  readonly trendVariance: number;
  /** Number of observations assimilated so far. */
  readonly observations: number;
}

/**
 * Configuration for {@link StateSpaceStrengthModel}. All fields optional.
 */
export interface StateSpaceStrengthModelOptions {
  /** Process noise on the level state per step (Q[0][0]). Default 0.5. */
  readonly processNoiseLevel?: number;
  /** Process noise on the trend state per step (Q[1][1]). Default 0.01. */
  readonly processNoiseTrend?: number;
  /** Default observation noise variance R when none is given per update. Default 25. */
  readonly observationNoise?: number;
  /** Initial level estimate. When omitted, the first observation seeds it. */
  readonly initialEstimate?: number;
  /** Initial level variance (diffuse prior). Default 1e6. */
  readonly initialVariance?: number;
  /** Initial trend estimate. Default 0. */
  readonly initialTrend?: number;
  /** Initial trend variance (diffuse prior). Default 1e6. */
  readonly initialTrendVariance?: number;
}

// =============================================================================
// Defaults
// =============================================================================

/** Default process noise on the level state (units²/step). */
export const DEFAULT_PROCESS_NOISE_LEVEL = 0.5;
/** Default process noise on the trend state (units²/step). */
export const DEFAULT_PROCESS_NOISE_TREND = 0.01;
/** Default observation noise variance (units²). */
export const DEFAULT_OBSERVATION_NOISE = 25;
/** Diffuse prior variance used to seed an uninformative initial state. */
export const DEFAULT_DIFFUSE_VARIANCE = 1e6;

// =============================================================================
// Model
// =============================================================================

/**
 * Online local-linear-trend Kalman filter over a stream of strength observations.
 *
 * Usage:
 *   const model = new StateSpaceStrengthModel();
 *   model.update(180);            // seeds the level on the first call
 *   const { estimate, variance } = model.update(182);
 *   model.state;                  // current snapshot without mutating
 *
 * Each `update` runs one predict + correct cycle. The very first observation
 * (when no `initialEstimate` was configured) seeds the level directly rather
 * than being blended into the diffuse prior, avoiding a meaningless first step.
 */
export class StateSpaceStrengthModel {
  private readonly qLevel: number;
  private readonly qTrend: number;
  private readonly defaultR: number;

  // State vector x = [level, trend].
  private level: number;
  private trend: number;

  // Covariance P (symmetric 2×2): [[p00, p01], [p10, p11]], p01 === p10.
  private p00: number;
  private p01: number;
  private p10: number;
  private p11: number;

  private count = 0;
  private seeded: boolean;

  constructor(options: StateSpaceStrengthModelOptions = {}) {
    this.qLevel = options.processNoiseLevel ?? DEFAULT_PROCESS_NOISE_LEVEL;
    this.qTrend = options.processNoiseTrend ?? DEFAULT_PROCESS_NOISE_TREND;
    this.defaultR = options.observationNoise ?? DEFAULT_OBSERVATION_NOISE;

    this.level = options.initialEstimate ?? 0;
    this.trend = options.initialTrend ?? 0;
    this.p00 = options.initialVariance ?? DEFAULT_DIFFUSE_VARIANCE;
    this.p11 = options.initialTrendVariance ?? DEFAULT_DIFFUSE_VARIANCE;
    this.p01 = 0;
    this.p10 = 0;

    this.seeded = options.initialEstimate !== undefined;
  }

  /**
   * Assimilate one strength observation and return the updated state.
   *
   * @param observation - Observed strength (e.g. an e1RM estimate).
   * @param observationVariance - Optional per-observation noise variance R.
   *   Larger values trust the observation less. Falls back to the configured
   *   default. A confidence score c ∈ (0, 1] can be mapped, e.g. R = base / c.
   * @returns A snapshot of the state after this update.
   */
  update(observation: number, observationVariance?: number): StrengthState {
    if (!Number.isFinite(observation)) {
      throw new RangeError('observation must be a finite number');
    }
    const r = observationVariance ?? this.defaultR;
    if (!(r > 0)) {
      throw new RangeError('observationVariance must be a positive number');
    }

    // First observation with no configured prior: seed the level directly so
    // the estimate starts on the signal rather than being dragged from 0.
    if (!this.seeded) {
      this.level = observation;
      this.trend = 0;
      this.p00 = r;
      this.seeded = true;
      this.count = 1;
      return this.state;
    }

    this.predict();
    this.correct(observation, r);
    this.count += 1;
    return this.state;
  }

  /** Current state snapshot without mutating the filter. */
  get state(): StrengthState {
    return {
      estimate: this.level,
      variance: this.p00,
      trend: this.trend,
      trendVariance: this.p11,
      observations: this.count,
    };
  }

  /**
   * Predict step: advance the state through F = [[1, 1], [0, 1]] and inflate
   * the covariance by the process noise Q.
   *
   *   x  = F x                → level += trend
   *   P  = F P Fᵀ + Q
   */
  private predict(): void {
    // x = F x
    this.level += this.trend;

    // P = F P Fᵀ.  With F = [[1,1],[0,1]]:
    //   p00' = p00 + p01 + p10 + p11
    //   p01' = p01 + p11
    //   p10' = p10 + p11
    //   p11' = p11
    const p00 = this.p00 + this.p01 + this.p10 + this.p11;
    const p01 = this.p01 + this.p11;
    const p10 = this.p10 + this.p11;
    const p11 = this.p11;

    // + Q (diagonal)
    this.p00 = p00 + this.qLevel;
    this.p01 = p01;
    this.p10 = p10;
    this.p11 = p11 + this.qTrend;
  }

  /**
   * Correct step: fold in observation z with noise r through H = [1, 0].
   *
   *   y = z - H x = z - level          (innovation)
   *   S = H P Hᵀ + r = p00 + r         (innovation variance)
   *   K = P Hᵀ / S = [p00/S, p10/S]ᵀ   (Kalman gain)
   *   x = x + K y
   *   P = (I - K H) P
   */
  private correct(z: number, r: number): void {
    const innovation = z - this.level;
    const s = this.p00 + r;
    const k0 = this.p00 / s;
    const k1 = this.p10 / s;

    this.level += k0 * innovation;
    this.trend += k1 * innovation;

    // P = (I - K H) P, with H = [1, 0] so K H = [[k0, 0], [k1, 0]].
    //   p00' = (1 - k0) p00
    //   p01' = (1 - k0) p01
    //   p10' = p10 - k1 p00
    //   p11' = p11 - k1 p01
    const p00 = (1 - k0) * this.p00;
    const p01 = (1 - k0) * this.p01;
    const p10 = this.p10 - k1 * this.p00;
    const p11 = this.p11 - k1 * this.p01;

    this.p00 = p00;
    this.p01 = p01;
    this.p10 = p10;
    this.p11 = p11;
  }
}
