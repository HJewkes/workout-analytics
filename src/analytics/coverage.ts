/**
 * Coverage Tracking (Analytics) — Load-velocity coverage per VBT autoregulation spec §9.1-§9.2.
 *
 * Tracks WHERE on the load axis (expressed as %e1RM) the athlete has recent
 * training data, so a planner can identify gaps and schedule exploration sets.
 *
 * Both functions are pure — no I/O, no logging.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Minimal summary of a completed training set, sufficient for coverage analysis.
 *
 * This is intentionally a structural type — any object with at least these two
 * fields can be passed in without wrapping.
 */
export interface SetSummary {
  /** Total load lifted in this set (lbs). */
  readonly weightLbs: number;
  /** ISO 8601 timestamp when the set started (e.g. "2026-03-01T10:00:00.000Z"). */
  readonly startedAt: string;
}

/**
 * A single intensity bin representing a [binMinPctE1RM, binMaxPctE1RM) range.
 *
 * Produced by `buildCoverageMap`; staleness flag set by `detectStaleBins`.
 */
export interface CoverageBin {
  /** Zero-based index within the returned array. */
  readonly binIndex: number;
  /** Lower bound of this bin's %e1RM range (inclusive, 0–1 scale, e.g. 0.40). */
  readonly binMinPctE1RM: number;
  /** Upper bound of this bin's %e1RM range (exclusive, 0–1 scale, e.g. 0.50). */
  readonly binMaxPctE1RM: number;
  /** Number of sets whose load fell in this bin within the lookback window. */
  readonly pointCount: number;
  /**
   * ISO timestamp of the most recent set in this bin within the lookback window.
   * `null` when pointCount is 0.
   */
  readonly lastSeenAt: string | null;
  /**
   * Whether this bin is considered stale.
   * Always `false` from `buildCoverageMap`; set by `detectStaleBins`.
   */
  readonly isStale: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_BIN_COUNT = 6;
const DEFAULT_BIN_MIN_PCT = 0.4;
const DEFAULT_BIN_MAX_PCT = 1.0;
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_STALENESS_DAYS = 21;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// =============================================================================
// buildCoverageMap
// =============================================================================

/**
 * Build a load-velocity coverage map over %e1RM bins.
 *
 * Steps:
 * 1. Discard sets older than `lookbackDays` (default 90).
 * 2. Compute each set's %e1RM as `weightLbs / e1RM`.
 * 3. Drop sets below `binMinPctE1RM` (too light to inform working-weight choices).
 * 4. Clamp sets above `binMaxPctE1RM` into the top bin (captures PR attempts).
 * 5. Record `pointCount` and `lastSeenAt` (max startedAt) per bin.
 *
 * @param sets          Set summaries with `weightLbs` and `startedAt`.
 * @param e1RM          Estimated 1RM for the exercise (lbs). Must be > 0.
 * @param opts.binCount          Number of equal-width bins (default 6).
 * @param opts.binMinPctE1RM     Minimum %e1RM included (default 0.40).
 * @param opts.binMaxPctE1RM     Maximum %e1RM for bin layout (default 1.00). Sets above this are clamped into the top bin.
 * @param opts.lookbackDays      Sets older than this are excluded (default 90).
 * @returns One `CoverageBin` per bin, sorted by ascending `binIndex`.
 */
export function buildCoverageMap(
  sets: readonly SetSummary[],
  e1RM: number,
  opts?: {
    binCount?: number;
    binMinPctE1RM?: number;
    binMaxPctE1RM?: number;
    lookbackDays?: number;
  }
): CoverageBin[] {
  const binCount = opts?.binCount ?? DEFAULT_BIN_COUNT;
  const binMinPct = opts?.binMinPctE1RM ?? DEFAULT_BIN_MIN_PCT;
  const binMaxPct = opts?.binMaxPctE1RM ?? DEFAULT_BIN_MAX_PCT;
  const lookbackDays = opts?.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  const binWidth = (binMaxPct - binMinPct) / binCount;

  // Build empty bins
  const pointCounts = new Array<number>(binCount).fill(0);
  const lastSeenAt = new Array<string | null>(binCount).fill(null);

  // Lookback cutoff — sets with startedAt before this are excluded
  const cutoffMs = Date.now() - lookbackDays * MS_PER_DAY;

  for (const set of sets) {
    // Exclude sets outside the lookback window
    const setMs = Date.parse(set.startedAt);
    if (setMs < cutoffMs) continue;

    if (e1RM <= 0) continue;

    const pct = set.weightLbs / e1RM;

    // Drop sets below the minimum intensity threshold
    if (pct < binMinPct) continue;

    // Determine bin index; clamp above-max into the top bin
    const rawIndex = Math.floor((pct - binMinPct) / binWidth);
    const binIndex = Math.min(rawIndex, binCount - 1);

    pointCounts[binIndex]++;

    const prev = lastSeenAt[binIndex];
    if (prev === null || set.startedAt > prev) {
      lastSeenAt[binIndex] = set.startedAt;
    }
  }

  return Array.from({ length: binCount }, (_, i) => ({
    binIndex: i,
    binMinPctE1RM: binMinPct + i * binWidth,
    binMaxPctE1RM: binMinPct + (i + 1) * binWidth,
    pointCount: pointCounts[i],
    lastSeenAt: lastSeenAt[i],
    isStale: false,
  }));
}

// =============================================================================
// detectStaleBins
// =============================================================================

/**
 * Mark bins as stale if their most recent observation is older than the threshold,
 * or if they have never been observed (`lastSeenAt: null`).
 *
 * Mutates `isStale` on each bin. Returns the same array for chaining.
 *
 * @param coverage               Output of `buildCoverageMap`.
 * @param stalenessThresholdDays Days before a bin is considered stale (default 21).
 * @param now                    Reference timestamp (default `new Date()`). Injectable for tests.
 * @returns The same `coverage` array (mutated), for chaining.
 */
export function detectStaleBins(
  coverage: CoverageBin[],
  stalenessThresholdDays: number = DEFAULT_STALENESS_DAYS,
  now: Date = new Date()
): CoverageBin[] {
  const nowMs = now.getTime();
  const thresholdMs = stalenessThresholdDays * MS_PER_DAY;

  for (let i = 0; i < coverage.length; i++) {
    const bin = coverage[i];
    const stale =
      bin.lastSeenAt === null || nowMs - Date.parse(bin.lastSeenAt) > thresholdMs;
    // CoverageBin is readonly, so replace the object
    coverage[i] = { ...bin, isStale: stale };
  }

  return coverage;
}
