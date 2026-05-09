/**
 * Exercise-Specific RIR Estimation - VBT spec §5.3 regression model.
 *
 * Replaces the simple velocity-loss interpolation with a per-exercise
 * regression: RIR ≈ c0 + c1*v_ratio + c2*velLossPct + c3*(repIndex/repsInSet)
 *
 * Adds a `range` (95% CI) and categorical `confidence` to the output.
 * Coefficients for default profiles are PLACEHOLDER values pending
 * calibration from real-device session data.
 */

// =============================================================================
// Types
// =============================================================================

export type ExerciseTypeId = 'cable-compound' | 'cable-isolation' | string;

/**
 * Per-exercise regression profile for RIR estimation.
 *
 * Coefficients follow VBT spec §5.3:
 *   RIR = c0 + c1*v_ratio + c2*velLossPct + c3*(repIndex/repsInSet)
 */
export interface ExerciseVBTProfile {
  exerciseTypeId: ExerciseTypeId;
  /**
   * Regression coefficients.
   * - v_ratio      = peakVelocity / baselineMaxVelocity  (dimensionless)
   * - velLossPct   = velocity loss from set start, 0-100
   * - repIndex/repsInSet = normalised rep position within set
   */
  coefficients: { c0: number; c1: number; c2: number; c3: number };
  /**
   * Standard error of the regression in RIR units.
   * Used to compute the 95% CI: point ± 1.96 * stderr, rounded to 0.5.
   * Defaults to 0.8 if omitted.
   */
  stderr?: number;
}

export interface RIREstimateInputs {
  /** Most recent rep's peak velocity (m/s). */
  peakVelocity: number;
  /** Baseline max velocity from the first reps of the set (m/s). */
  baselineMaxVelocity: number;
  /** Velocity loss percentage 0-100 from set start to current rep. */
  velLossPct: number;
  /** 1-indexed rep number within the set. */
  repIndex: number;
  /**
   * Total reps targeted for the set.
   * Defaults to 8 when null / undefined (neutral mid-range assumption).
   */
  repsInSet?: number | null;
}

/**
 * RIR estimate from the regression model.
 *
 * Named `ExerciseRIREstimate` (not the bare `RIREstimate` from `analytics/fatigue.ts`)
 * to be unambiguous at the public API level. Adds `range` (95% CI) that the
 * analytics version does not carry.
 */
export interface ExerciseRIREstimate {
  /** Point estimate, clamped to >= 0. */
  rir: number;
  /** 95% CI band from stderr, half-rep resolution. */
  range: { low: number; high: number };
  /**
   * Categorical confidence derived from how close v_ratio + velLossPct
   * are to the regression calibration window.
   *
   * - 'high':   velLossPct ∈ [10, 50] AND v_ratio ∈ [0.4, 1.0]
   * - 'medium': velLossPct ∈ [5, 70]  AND v_ratio ∈ [0.3, 1.1]
   * - 'low':    outside both windows
   */
  confidence: 'low' | 'medium' | 'high';
}

// =============================================================================
// Default Profiles
// =============================================================================

/**
 * Default profile for cable compound exercises (rows, pulldowns, cable press, etc.).
 *
 * @experimental Coefficients are placeholder values pending calibration from
 * real-device session data. Calibrated values will land in
 * voltra-private/research/ and be promoted to a future minor release.
 *
 * Shape logic: high RIR at high v_ratio + low velLossPct (fresh, fast reps),
 * low RIR at low v_ratio + high velLossPct (fatigued, slow reps).
 */
export const DEFAULT_CABLE_COMPOUND_PROFILE: ExerciseVBTProfile = {
  exerciseTypeId: 'cable-compound',
  // Placeholder coefficients — calibration deferred pending real-device session data.
  coefficients: { c0: 8.0, c1: -3.0, c2: -0.10, c3: -2.0 },
  stderr: 0.8,
};

/**
 * Default profile for cable isolation exercises (curls, tricep pushdowns, flyes, etc.).
 *
 * @experimental Coefficients are placeholder values pending calibration from
 * real-device session data. Calibrated values will land in
 * voltra-private/research/ and be promoted to a future minor release.
 *
 * Isolation exercises show lower absolute velocities and a steeper velocity-loss
 * curve vs compound movements, reflected in the slightly more conservative coefficients.
 */
export const DEFAULT_CABLE_ISOLATION_PROFILE: ExerciseVBTProfile = {
  exerciseTypeId: 'cable-isolation',
  // Placeholder coefficients — calibration deferred pending real-device session data.
  coefficients: { c0: 7.5, c1: -2.5, c2: -0.08, c3: -1.5 },
  stderr: 0.9,
};

/**
 * Fallback profile when no exercise-specific profile is available.
 * Mirrors the isolation profile as the more conservative choice.
 */
export const DEFAULT_FALLBACK_PROFILE: ExerciseVBTProfile = DEFAULT_CABLE_ISOLATION_PROFILE;

// =============================================================================
// Helpers
// =============================================================================

/** Round to nearest 0.5 */
function roundHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function computeConfidence(vRatio: number, velLossPct: number): 'high' | 'medium' | 'low' {
  if (velLossPct >= 10 && velLossPct <= 50 && vRatio >= 0.4 && vRatio <= 1.0) {
    return 'high';
  }
  if (velLossPct >= 5 && velLossPct <= 70 && vRatio >= 0.3 && vRatio <= 1.1) {
    return 'medium';
  }
  return 'low';
}

// =============================================================================
// Core Function
// =============================================================================

/**
 * Estimate RIR (Reps in Reserve) using VBT spec §5.3 regression model.
 *
 * When `exerciseProfile` is omitted, falls back to `DEFAULT_FALLBACK_PROFILE`.
 *
 * @param inputs - Current rep metrics
 * @param exerciseProfile - Exercise-specific regression coefficients + stderr.
 *   Omit to use the built-in fallback profile.
 * @returns ExerciseRIREstimate with point estimate, 95% CI range, and confidence label.
 */
export function estimateRIRWithProfile(
  inputs: RIREstimateInputs,
  exerciseProfile?: ExerciseVBTProfile,
): ExerciseRIREstimate {
  const profile = exerciseProfile ?? DEFAULT_FALLBACK_PROFILE;
  const { c0, c1, c2, c3 } = profile.coefficients;
  const stderr = profile.stderr ?? 0.8;

  const { peakVelocity, baselineMaxVelocity, velLossPct, repIndex } = inputs;
  const repsInSet = inputs.repsInSet ?? 8;

  // Clamp denominator to avoid divide-by-zero
  const safeBaseline = Math.max(baselineMaxVelocity, 0.001);
  const vRatio = peakVelocity / safeBaseline;
  const repProgressRatio = repIndex / repsInSet;

  const rawRIR = c0 + c1 * vRatio + c2 * velLossPct + c3 * repProgressRatio;
  const rir = Math.max(0, rawRIR);

  const halfBand = roundHalf(1.96 * stderr);
  const range = {
    low: Math.max(0, roundHalf(rir - halfBand)),
    high: roundHalf(rir + halfBand),
  };

  const confidence = computeConfidence(vRatio, velLossPct);

  return { rir, range, confidence };
}
