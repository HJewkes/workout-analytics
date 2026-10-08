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

import type { LoadVelocityDataPoint } from './profile.js';

// =============================================================================
// Types
// =============================================================================

/**
 * A single coverage bin representing a %e1RM range.
 */
export interface CoverageBin {
  /** [low, high) %e1RM range; the top bin also includes its high edge */
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
 * Relative slack when counting bins. A width like 0.1 is not exact in binary,
 * so a span that holds a whole number of widths can divide to a few ULPs above
 * that number (0.3 / 0.1 = 3.0000000000000004). Ceil alone would then add a
 * sliver top bin. 1e-12 is far above that rounding error and far below any
 * partial bin a caller could mean.
 */
const BIN_COUNT_TOLERANCE = 1e-12;

/**
 * Build empty bins by index so edges never accumulate rounding error.
 * The last bin may be narrower than `binWidth` and always ends at `rangeMax`.
 */
function createBins(rangeMin: number, rangeMax: number, binWidth: number): CoverageBin[] {
  if (!Number.isFinite(rangeMin) || !Number.isFinite(rangeMax) || rangeMax <= rangeMin) {
    throw new RangeError('binRange must be two finite numbers with max above min');
  }
  const widths = (rangeMax - rangeMin) / binWidth;
  const binCount = Math.max(1, Math.ceil(widths * (1 - BIN_COUNT_TOLERANCE)));
  if (!Number.isFinite(binCount)) {
    throw new RangeError('binRange holds too many bins of binWidth');
  }
  return Array.from({ length: binCount }, (_, i) => {
    const low = rangeMin + i * binWidth;
    const high = i === binCount - 1 ? rangeMax : rangeMin + (i + 1) * binWidth;
    return { range: [low, high] as const, count: 0, lastObservedAt: null };
  });
}

/**
 * Compute coverage of the load-velocity spectrum from observed data points.
 *
 * Bins data points by their load as a percentage of estimated 1RM. A point
 * exactly at the top of `binRange` (a true single at 100%) counts in the top
 * bin, matching `buildCoverageMap`.
 *
 * @param dataPoints - Observed load-velocity data
 * @param e1RM - Current estimated 1RM (used to compute %e1RM for each point)
 * @param options - Bin width, range, and staleness configuration
 * @returns Coverage analysis with bins, gaps, and overall score
 * @throws RangeError if `binWidth` is not a finite positive number, or if
 *   `binRange` has a non-finite bound or a max at or below its min
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
  if (!Number.isFinite(binWidth) || binWidth <= 0) {
    throw new RangeError('binWidth must be a finite positive number');
  }
  const [rangeMin, rangeMax] = options?.binRange ?? [40, 100];
  const stalenessMs = options?.stalenessMs;
  const now = Date.now();

  const bins = createBins(rangeMin, rangeMax, binWidth);

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
      const isTopEdge = i === bins.length - 1 && pctE1RM === high;
      if (pctE1RM >= low && (pctE1RM < high || isTopEdge)) {
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
