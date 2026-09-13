/**
 * Velocity Baseline - Expected velocity at a given load from historical data.
 *
 * Builds a baseline from first-rep velocity observations at various loads,
 * then provides expected velocity via linear interpolation.
 * Used for readiness assessment (comparing today's velocity to baseline).
 */

import type { BaselineKey } from '@/models/baseline-key';
import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Types
// =============================================================================

/**
 * Immutable velocity baseline built from historical observations.
 * Data points are sorted by load (ascending).
 */
export interface VelocityBaseline {
  readonly dataPoints: readonly LoadVelocityDataPoint[];
  /**
   * Identity this baseline was collected for — `(user, exercise, setup, side)`.
   * Optional: a caller that keeps one baseline per stream externally need not
   * stamp it. When present it survives serialize/deserialize round-trips.
   */
  readonly key?: BaselineKey;
}

/**
 * Serialized form of a VelocityBaseline for persistence.
 * Stores data points as plain objects compatible with JSON serialization.
 */
export interface SerializedBaseline {
  readonly version: 1;
  readonly dataPoints: ReadonlyArray<{
    readonly load: number;
    readonly velocity: number;
    readonly timestamp?: number;
  }>;
  /**
   * Baseline identity, when the in-memory baseline carried one. Absent on
   * payloads written before keys existed — `deserializeBaseline` tolerates
   * that, so the wire `version` stays at 1.
   */
  readonly key?: BaselineKey;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Build a velocity baseline from historical first-rep data points.
 * Points are sorted by load for efficient interpolation.
 *
 * If multiple observations exist at similar loads, all are preserved
 * (averaging could be done upstream if desired).
 *
 * @param dataPoints - Historical load-velocity observations
 * @param key - Optional identity the observations belong to
 * @returns Immutable VelocityBaseline
 */
export function buildBaseline(
  dataPoints: LoadVelocityDataPoint[],
  key?: BaselineKey
): VelocityBaseline {
  const sorted = [...dataPoints].sort((a, b) => a.load - b.load);
  return { dataPoints: sorted, ...(key !== undefined ? { key } : {}) };
}

/**
 * Get expected velocity at a given load via linear interpolation.
 *
 * Interpolates between the two nearest data points bracketing the load.
 * Returns null if the load is outside the observed range or if there
 * are no data points.
 *
 * @param baseline - The velocity baseline
 * @param load - Load to estimate velocity for
 * @returns Expected velocity in m/s, or null if out of range
 */
export function getExpectedVelocity(baseline: VelocityBaseline, load: number): number | null {
  const points = baseline.dataPoints;

  if (points.length === 0) {
    return null;
  }

  if (points.length === 1) {
    // Only one point: return its velocity only if load matches exactly
    return points[0].load === load ? points[0].velocity : null;
  }

  // Out of range
  if (load < points[0].load || load > points[points.length - 1].load) {
    return null;
  }

  // Exact match at boundary
  if (load === points[0].load) return points[0].velocity;
  if (load === points[points.length - 1].load) return points[points.length - 1].velocity;

  // Find bracketing points
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (load >= p1.load && load <= p2.load) {
      // Linear interpolation
      if (p2.load === p1.load) return p1.velocity;
      const t = (load - p1.load) / (p2.load - p1.load);
      return p1.velocity + t * (p2.velocity - p1.velocity);
    }
  }

  return null;
}

let untimestampedEvictionWarned = false;

/** Warn once per process: eviction on this baseline could not use real ages. */
function warnUntimestampedEviction(): void {
  if (untimestampedEvictionWarned) return;
  untimestampedEvictionWarned = true;
  console.warn(
    '[@voltras/workout-analytics] updateBaselineWithPoint evicted from a baseline whose points ' +
      'carry no timestamp. Until this release that dropped the LOWEST-LOAD point every time, ' +
      'eating the load-velocity profile from below; it now drops an unknown-age point of lowest ' +
      'regression leverage, so the fit is no longer biased in a fixed direction. Stamp points ' +
      'with `timestamp` to get true age-ordered eviction.'
  );
}

/**
 * Index of the point to evict: the oldest by `timestamp`, where an absent
 * timestamp ranks older than any present one (age unknown, and the baseline
 * predates the write that is adding a stamped point).
 *
 * Within a tied cohort — legacy points that all lack a timestamp, or two writes
 * landing in the same millisecond — the point of lowest regression leverage
 * goes. Leverage is `(load - meanLoad)^2 / Σ(load - meanLoad)^2`, so the point
 * nearest the mean load is the one whose removal perturbs the fitted slope and
 * intercept least. Index order breaks a remaining tie, for determinism.
 */
function evictionIndex(points: readonly LoadVelocityDataPoint[]): number {
  const age = (p: LoadVelocityDataPoint): number => p.timestamp ?? -Infinity;
  const oldest = Math.min(...points.map(age));
  const meanLoad = points.reduce((sum, p) => sum + p.load, 0) / points.length;
  const leverage = (p: LoadVelocityDataPoint): number => Math.abs(p.load - meanLoad);

  let chosen = -1;
  for (let i = 0; i < points.length; i++) {
    if (age(points[i]) !== oldest) continue;
    if (chosen === -1 || leverage(points[i]) < leverage(points[chosen])) chosen = i;
  }
  return chosen;
}

/**
 * Add a new observation to an existing baseline and return a new baseline.
 * The original baseline is not mutated.
 *
 * The new point is stamped with `opts.timestamp`, defaulting to `Date.now()`.
 *
 * When `maxPoints` is set and the cap is exceeded, one point is dropped: the
 * oldest by `timestamp`, with `evictionIndex`'s rule for points that carry no
 * timestamp. Untimestamped points are left untimestamped — the field means a
 * real observation time and is read for recency weighting, so a synthetic one
 * would be a lie on the wire. Their first eviction logs a one-time
 * `console.warn`, because the order changed in this release.
 *
 * @param baseline - Existing velocity baseline
 * @param loadPctE1RM - Load for the new observation (same units as existing points)
 * @param peakVelocity - Peak concentric velocity in m/s
 * @param opts.maxPoints - Maximum number of data points to retain
 * @param opts.timestamp - Timestamp for the new point (defaults to Date.now())
 * @returns New immutable VelocityBaseline with the observation added
 */
export function updateBaselineWithPoint(
  baseline: VelocityBaseline,
  loadPctE1RM: number,
  peakVelocity: number,
  opts?: { maxPoints?: number; timestamp?: number }
): VelocityBaseline {
  const newPoint: LoadVelocityDataPoint = {
    load: loadPctE1RM,
    velocity: peakVelocity,
    timestamp: opts?.timestamp ?? Date.now(),
  };

  let combined: LoadVelocityDataPoint[] = [...baseline.dataPoints, newPoint];

  const { maxPoints } = opts ?? {};
  if (maxPoints !== undefined && combined.length > maxPoints) {
    if (combined.some((p) => p.timestamp === undefined)) warnUntimestampedEviction();
    const evictIdx = evictionIndex(combined);
    combined = combined.filter((_, idx) => idx !== evictIdx);
  }

  return buildBaseline(combined, baseline.key);
}

/**
 * Serialize a VelocityBaseline to a plain JSON-compatible object.
 *
 * The resulting `SerializedBaseline` can be stored in the WA-04 SessionStore
 * or any JSON-capable persistence layer. Use `deserializeBaseline` to restore.
 *
 * @param baseline - Baseline to serialize
 * @returns Plain serializable representation
 */
export function serializeBaseline(baseline: VelocityBaseline): SerializedBaseline {
  return {
    version: 1,
    dataPoints: baseline.dataPoints.map((p) => ({
      load: p.load,
      velocity: p.velocity,
      ...(p.timestamp !== undefined ? { timestamp: p.timestamp } : {}),
    })),
    ...(baseline.key !== undefined ? { key: baseline.key } : {}),
  };
}

/**
 * Restore a VelocityBaseline from its serialized form.
 *
 * Tolerates missing optional fields (`timestamp`, `key`) on individual data
 * points and on the payload itself.
 * Unknown fields on the raw object are ignored for forward compatibility.
 *
 * @param raw - Serialized baseline (as produced by `serializeBaseline`)
 * @returns Immutable VelocityBaseline
 */
export function deserializeBaseline(raw: SerializedBaseline): VelocityBaseline {
  const points: LoadVelocityDataPoint[] = (raw.dataPoints ?? []).map((p) => ({
    load: p.load,
    velocity: p.velocity,
    ...(p.timestamp !== undefined ? { timestamp: p.timestamp } : {}),
  }));
  return buildBaseline(points, raw.key);
}
