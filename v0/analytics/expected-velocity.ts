/**
 * Expected Velocity Strategies
 *
 * Provides different strategies for determining what velocity "should" be,
 * unifying the concept of "baseline" from multiple sources:
 * - First N reps of current set (intra-set baseline)
 * - Historical baseline (cross-session)
 * - Rep speed tables (future)
 * - User-specific load-velocity profiles (future)
 */
import type { Set } from '../models/set';
import { getRepMeanVelocity, getPhaseMeanVelocity } from '@/models';
import type { VelocityBaseline } from './baseline';
import { getBaselineVelocity } from './baseline';

// ============================================================
// Types
// ============================================================

/**
 * Source of expected velocity data.
 */
export type ExpectedVelocitySource =
  | 'first-n-reps'
  | 'historical'
  | 'rep-table'
  | 'user-profile';

/**
 * Expected velocity with metadata about its source.
 */
export interface ExpectedVelocity {
  /** Expected concentric velocity (m/s) */
  readonly concentric: number;
  /** Expected eccentric velocity (m/s) */
  readonly eccentric: number;
  /** Where this expectation came from */
  readonly source: ExpectedVelocitySource;
  /** Confidence in this expectation (0-1) */
  readonly confidence: number;
}

/**
 * Default number of reps to use for intra-set baseline.
 */
export const DEFAULT_BASELINE_REPS = 2;

// ============================================================
// Strategy 1: First N Reps (Intra-Set Baseline)
// ============================================================

/**
 * Compute expected velocity from first N reps of a set.
 * This is the v0 SetAggregator approach - useful for intra-set fatigue detection.
 *
 * @param set - The set to analyze
 * @param n - Number of reps to use for baseline (default: 2)
 * @returns Expected velocity, or null if not enough reps
 */
export function computeExpectedFromFirstNReps(
  set: Set,
  n: number = DEFAULT_BASELINE_REPS
): ExpectedVelocity | null {
  if (set.reps.length === 0) return null;

  const sampleSize = Math.min(n, set.reps.length);
  if (sampleSize === 0) return null;

  const sampleReps = set.reps.slice(0, sampleSize);
  const concentricVelocities = sampleReps.map((r) => getRepMeanVelocity(r));
  const eccentricVelocities = sampleReps.map((r) => getPhaseMeanVelocity(r.eccentric));

  const concentricMean = mean(concentricVelocities);
  const eccentricMean = mean(eccentricVelocities);

  // Confidence based on sample size relative to requested
  const confidence = sampleSize >= n ? 0.8 : 0.5;

  return {
    concentric: concentricMean,
    eccentric: eccentricMean,
    source: 'first-n-reps',
    confidence,
  };
}

// ============================================================
// Strategy 2: Historical Baseline
// ============================================================

/**
 * Compute expected velocity from historical baseline data.
 * Wraps the existing v0/analytics/baseline.ts functionality.
 *
 * @param baseline - Historical velocity baseline for the exercise
 * @param weight - Weight being used (for interpolation)
 * @returns Expected velocity, or null if no baseline data
 */
export function computeExpectedFromHistorical(
  baseline: VelocityBaseline,
  weight: number
): ExpectedVelocity | null {
  const concentricVelocity = getBaselineVelocity(baseline, weight);

  if (concentricVelocity === null) return null;

  // Historical baselines typically only track concentric velocity
  // Eccentric is estimated as ~50% of concentric (controlled lowering)
  const eccentricVelocity = concentricVelocity * 0.5;

  // Confidence based on baseline data density
  const dataPoints = baseline.weightVelocityMap.size;
  const confidence = dataPoints >= 5 ? 0.9 : dataPoints >= 2 ? 0.7 : 0.5;

  return {
    concentric: concentricVelocity,
    eccentric: eccentricVelocity,
    source: 'historical',
    confidence,
  };
}

// ============================================================
// Strategy 3: Rep Speed Tables (Future)
// ============================================================

// TODO: Implement when rep speed table data is available
// export function computeExpectedFromRepTable(
//   exercise: Exercise,
//   weight: number,
//   userProfile?: UserProfile
// ): ExpectedVelocity | null

// ============================================================
// Helpers
// ============================================================

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
