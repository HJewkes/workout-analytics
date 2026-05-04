/**
 * Coverage Tracking - Pure computation of load-velocity coverage.
 *
 * Bins data points by %e1RM to identify gaps in the athlete's
 * training history. Used to schedule exploration sets and validate
 * profile accuracy across the full intensity spectrum.
 *
 * The app handles persistence and staleness policy; this module
 * is pure computation.
 */

import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Types
// =============================================================================

/**
 * A single coverage bin representing a %e1RM range.
 */
export interface CoverageBin {
  /** [low, high) %e1RM range */
  readonly range: readonly [number, number];
  /** Number of data points in this bin */
  readonly count: number;
  /** Timestamp of most recent observation, or null if no data */
  readonly lastObservedAt: number | null;
}

/**
 * Full coverage analysis result.
 */
export interface CoverageResult {
  /** All bins in the analysis */
  readonly bins: readonly CoverageBin[];
  /** Bins with zero observations */
  readonly gaps: readonly CoverageBin[];
  /** Overall coverage score (0-1): fraction of bins with at least one observation */
  readonly coverageScore: number;
}

// =============================================================================
// Functions
// =============================================================================

/**
 * Compute coverage of the load-velocity spectrum from observed data points.
 *
 * Bins data points by their load as a percentage of estimated 1RM.
 *
 * @param dataPoints - Observed load-velocity data
 * @param e1RM - Current estimated 1RM (used to compute %e1RM for each point)
 * @param options - Bin width, range, and staleness configuration
 * @returns Coverage analysis with bins, gaps, and overall score
 */
export function computeCoverage(
  dataPoints: readonly LoadVelocityDataPoint[],
  e1RM: number,
  options?: {
    binWidth?: number;
    binRange?: [number, number];
    stalenessMs?: number;
  }
): CoverageResult {
  const binWidth = options?.binWidth ?? 10;
  const [rangeMin, rangeMax] = options?.binRange ?? [40, 100];
  const stalenessMs = options?.stalenessMs;
  const now = Date.now();

  // Create bins
  const bins: CoverageBin[] = [];
  for (let low = rangeMin; low < rangeMax; low += binWidth) {
    const high = Math.min(low + binWidth, rangeMax);
    bins.push({ range: [low, high], count: 0, lastObservedAt: null });
  }

  if (e1RM <= 0) {
    return {
      bins,
      gaps: [...bins],
      coverageScore: 0,
    };
  }

  // Bin each data point
  for (const dp of dataPoints) {
    const pctE1RM = (dp.load / e1RM) * 100;

    for (let i = 0; i < bins.length; i++) {
      const [low, high] = bins[i].range;
      if (pctE1RM >= low && pctE1RM < high) {
        const timestamp = dp.timestamp ?? null;

        // Apply staleness filter
        if (stalenessMs !== undefined && timestamp !== null) {
          if (now - timestamp > stalenessMs) continue;
        }

        bins[i] = {
          ...bins[i],
          count: bins[i].count + 1,
          lastObservedAt:
            timestamp !== null
              ? Math.max(bins[i].lastObservedAt ?? 0, timestamp)
              : bins[i].lastObservedAt,
        };
        break;
      }
    }
  }

  // Identify gaps (bins with zero observations)
  const gaps = bins.filter((bin) => bin.count === 0);

  // Coverage score: fraction of bins with at least one observation
  const coveredBins = bins.filter((bin) => bin.count > 0).length;
  const coverageScore = bins.length > 0 ? coveredBins / bins.length : 0;

  return { bins, gaps, coverageScore };
}

/**
 * Identify bins that need more data points.
 *
 * A bin is a "gap" if it has fewer than minObservations data points.
 * Useful for directing the athlete to train at under-sampled intensities.
 *
 * @param coverage - Result from computeCoverage()
 * @param minObservations - Minimum count to be considered "covered" (default 1)
 * @returns Bins that are below the observation threshold
 */
export function identifyCoverageGaps(
  coverage: CoverageResult,
  minObservations: number = 1
): readonly CoverageBin[] {
  return coverage.bins.filter((bin) => bin.count < minObservations);
}
