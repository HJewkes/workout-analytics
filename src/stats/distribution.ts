/**
 * StreamingDistribution - Incremental statistics with O(1) updates.
 *
 * Uses Welford's algorithm for numerically stable variance calculation.
 * Stores both running sum (for easy merging) and m2 (for stable variance).
 */

/**
 * Immutable streaming distribution.
 * All metrics computed via running aggregates for O(1) access.
 */
export interface StreamingDistribution {
  /** Sample count */
  readonly n: number;
  /** Running sum (for mean calculation and easy merging) */
  readonly sum: number;
  /** Welford's sum of squared deviations from mean (for stable variance) */
  readonly m2: number;
  /** Minimum observed value */
  readonly min: number;
  /** Maximum observed value */
  readonly max: number;
}

/**
 * Empty distribution constant.
 * Safe to share since StreamingDistribution is immutable.
 */
export const EMPTY_DISTRIBUTION: StreamingDistribution = Object.freeze({
  n: 0,
  sum: 0,
  m2: 0,
  min: Infinity,
  max: -Infinity,
});

/**
 * Create a new empty distribution.
 */
export function createDistribution(): StreamingDistribution {
  return EMPTY_DISTRIBUTION;
}

/**
 * Add a sample to the distribution, returns NEW distribution (immutable).
 * Uses Welford's online algorithm for numerically stable variance.
 */
export function addSample(dist: StreamingDistribution, value: number): StreamingDistribution {
  const n = dist.n + 1;
  const sum = dist.sum + value;

  // Welford's algorithm for stable variance
  const oldMean = dist.n > 0 ? dist.sum / dist.n : 0;
  const newMean = sum / n;
  const m2 = dist.m2 + (value - oldMean) * (value - newMean);

  return {
    n,
    sum,
    m2,
    min: Math.min(dist.min, value),
    max: Math.max(dist.max, value),
  };
}

/**
 * Merge two distributions using the parallel variance algorithm (Chan et al.).
 * Useful for combining statistics from different sessions or time periods.
 */
export function mergeDist(a: StreamingDistribution, b: StreamingDistribution): StreamingDistribution {
  if (a.n === 0) return b;
  if (b.n === 0) return a;

  const n = a.n + b.n;
  const sum = a.sum + b.sum;

  // Parallel variance algorithm
  const meanA = a.sum / a.n;
  const meanB = b.sum / b.n;
  const delta = meanB - meanA;
  const m2 = a.m2 + b.m2 + (delta * delta * a.n * b.n) / n;

  return {
    n,
    sum,
    m2,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
  };
}

/**
 * Get the mean of the distribution.
 * Returns 0 for empty distributions.
 */
export function getMean(dist: StreamingDistribution): number {
  if (dist.n === 0) return 0;
  return dist.sum / dist.n;
}

/**
 * Get the sample variance (with Bessel's correction).
 * Returns 0 for distributions with fewer than 2 samples.
 */
export function getVariance(dist: StreamingDistribution): number {
  if (dist.n < 2) return 0;
  return dist.m2 / (dist.n - 1);
}

/**
 * Get the sample standard deviation.
 * Returns 0 for distributions with fewer than 2 samples.
 */
export function getStdDev(dist: StreamingDistribution): number {
  return Math.sqrt(getVariance(dist));
}

/**
 * Get the z-score for a value relative to this distribution.
 * Returns 0 if the distribution has no variance (n < 2 or all same values).
 */
export function getZScore(dist: StreamingDistribution, value: number): number {
  const stdDev = getStdDev(dist);
  if (stdDev === 0) return 0;
  return (value - getMean(dist)) / stdDev;
}

/**
 * Get the coefficient of variation (CV = stdDev / mean).
 * Returns 0 if mean is 0 or distribution has no variance.
 */
export function getCV(dist: StreamingDistribution): number {
  const mean = getMean(dist);
  if (mean === 0) return 0;
  return getStdDev(dist) / Math.abs(mean);
}

/**
 * Check if a value is an outlier based on z-score threshold.
 * Default threshold is 2.0 standard deviations.
 */
export function isOutlier(
  dist: StreamingDistribution,
  value: number,
  zThreshold: number = 2.0
): boolean {
  return Math.abs(getZScore(dist, value)) >= zThreshold;
}

/**
 * Check if a value is within a given number of standard deviations.
 * Default is 2.0 sigmas.
 */
export function isWithinRange(
  dist: StreamingDistribution,
  value: number,
  sigmas: number = 2.0
): boolean {
  return Math.abs(getZScore(dist, value)) <= sigmas;
}

/**
 * Build a distribution from an array of values.
 * Convenience function for creating distributions from existing data.
 */
export function buildDistribution(values: readonly number[]): StreamingDistribution {
  return values.reduce((dist, value) => addSample(dist, value), EMPTY_DISTRIBUTION);
}
