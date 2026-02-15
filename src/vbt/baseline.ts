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
export function getExpectedVelocity(
  baseline: VelocityBaseline,
  load: number,
): number | null {
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
