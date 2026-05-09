/**
 * Velocity Baseline - Expected velocity at a given load from historical data.
 *
 * Builds a baseline from first-rep velocity observations at various loads,
 * then provides expected velocity via linear interpolation.
 * Used for readiness assessment (comparing today's velocity to baseline).
 */

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
 * @returns Immutable VelocityBaseline
 */
export function buildBaseline(dataPoints: LoadVelocityDataPoint[]): VelocityBaseline {
  const sorted = [...dataPoints].sort((a, b) => a.load - b.load);
  return { dataPoints: sorted };
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

/**
 * Add a new observation to an existing baseline and return a new baseline.
 * The original baseline is not mutated.
 *
 * When `maxPoints` is set and the cap is reached, the oldest point by
 * insertion order (lowest index before sort) is dropped. "Oldest" means
 * the point with the smallest `timestamp` value; if timestamps are absent,
 * the first element in the pre-update sorted array is dropped.
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
    ...(opts?.timestamp !== undefined ? { timestamp: opts.timestamp } : {}),
  };

  let combined: LoadVelocityDataPoint[] = [...baseline.dataPoints, newPoint];

  const { maxPoints } = opts ?? {};
  if (maxPoints !== undefined && combined.length > maxPoints) {
    // Drop the oldest point: prefer timestamp-based ordering, fall back to
    // first element in the current (already load-sorted) array.
    const hasTimestamps = combined.every((p) => p.timestamp !== undefined);
    if (hasTimestamps) {
      const oldestIdx = combined.reduce(
        (minIdx, p, idx) => (p.timestamp! < combined[minIdx].timestamp! ? idx : minIdx),
        0
      );
      combined = combined.filter((_, idx) => idx !== oldestIdx);
    } else {
      // Drop the first point in load-sorted order (lowest load)
      combined = combined.slice(1);
    }
  }

  return buildBaseline(combined);
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
  };
}

/**
 * Restore a VelocityBaseline from its serialized form.
 *
 * Tolerates missing optional fields (`timestamp`) on individual data points.
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
  return buildBaseline(points);
}
