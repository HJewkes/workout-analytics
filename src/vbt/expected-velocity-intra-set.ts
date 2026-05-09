/**
 * Intra-Set Expected Velocity Strategy
 *
 * Computes the expected velocity for a set's later reps from the average
 * peak velocity of the first N reps. Used for live fatigue feedback during
 * a set ("am I slowing down vs my own first two reps?").
 *
 * Two APIs are provided:
 *   - `computeExpectedFromFirstNReps`: pure function over a Set (v0 port)
 *   - `createFirstNRepsStrategy`: stateful, event-driven strategy for live use
 *
 * Ported from v0/analytics/expected-velocity.ts (git 884f0a2^).
 */

import type { Set } from '@/models/set';
import { getRepPeakVelocity } from '@/models/rep';

// =============================================================================
// Shared types
// =============================================================================

/**
 * Source tag for expected-velocity estimates produced by this module.
 */
export type IntraSetExpectedVelocitySource = 'first-n-reps';

/**
 * Expected velocity derived from the first N reps of a set.
 * Confidence is based on whether a full N-rep sample was available.
 */
export interface IntraSetExpectedVelocity {
  /** Mean peak velocity of the first N reps (m/s) */
  readonly meanPeakVelocity: number;
  readonly source: IntraSetExpectedVelocitySource;
  /** 0–1. 0.8 when a full N-rep sample is used; 0.5 when set had fewer than N reps. */
  readonly confidence: number;
}

// =============================================================================
// Default constants (matches v0)
// =============================================================================

/** Default number of reps used to form the intra-set baseline. */
export const DEFAULT_FIRST_N_REPS = 2;

// =============================================================================
// Pure function API (v0 port: computeExpectedFromFirstNReps)
// =============================================================================

/**
 * Compute expected velocity from the first N reps of a set.
 *
 * Returns the mean peak concentric velocity of the first N completed reps.
 * Returns null if the set has no reps.
 *
 * When the set has fewer than N reps the estimate is returned with reduced
 * confidence (0.5 instead of 0.8) so callers can decide whether to show it.
 *
 * @param set - The set to analyse
 * @param n - Number of reps to form the baseline (default: 2)
 */
export function computeExpectedFromFirstNReps(
  set: Set,
  n: number = DEFAULT_FIRST_N_REPS
): IntraSetExpectedVelocity | null {
  if (set.reps.length === 0) return null;

  const sampleSize = Math.min(n, set.reps.length);
  const sampleReps = set.reps.slice(0, sampleSize);
  const peakVelocities = sampleReps.map(getRepPeakVelocity);
  const meanPeakVelocity = arithmeticMean(peakVelocities);

  return {
    meanPeakVelocity,
    source: 'first-n-reps',
    confidence: sampleSize >= n ? 0.8 : 0.5,
  };
}

// =============================================================================
// Stateful strategy API (live set use)
// =============================================================================

/**
 * Stateful strategy that accumulates peak velocities rep-by-rep and exposes
 * the first-N-reps mean as the intra-set expected velocity.
 */
export interface IntraSetExpectedVelocityStrategy {
  /**
   * Record the peak velocity from one completed rep.
   * Must be called once per rep, in order. Only the first `firstNReps` calls
   * contribute to the baseline; subsequent calls are tracked for loss
   * computation but do not change the baseline.
   */
  recordRep(peakVelocity: number): void;

  /**
   * Expected velocity for upcoming reps.
   * Returns null until at least `firstNReps` reps have been recorded.
   */
  getExpectedVelocity(): number | null;

  /**
   * Velocity-loss percentage of the most recent rep against the expected
   * baseline: `(expected - last) / expected * 100`.
   *
   * Returns null if expected velocity is not yet available, or if no rep
   * has been recorded after the baseline window.
   */
  getCurrentVelocityLossPct(): number | null;

  /** Reset state for a new set. */
  reset(): void;
}

/** Options for `createFirstNRepsStrategy`. */
export interface FirstNRepsStrategyOptions {
  /**
   * Number of reps whose mean peak velocity forms the baseline.
   * Default: 2 (matching v0).
   */
  firstNReps?: number;
}

/**
 * Create a stateful first-N-reps intra-set expected-velocity strategy.
 *
 * @example
 * ```ts
 * const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
 * for (const rep of liveReps) {
 *   strategy.recordRep(rep.peakVelocity);
 *   const loss = strategy.getCurrentVelocityLossPct();
 *   if (loss !== null && loss > 20) showFatigueWarning();
 * }
 * strategy.reset(); // next set
 * ```
 */
export function createFirstNRepsStrategy(
  opts?: FirstNRepsStrategyOptions
): IntraSetExpectedVelocityStrategy {
  const firstNReps = opts?.firstNReps ?? DEFAULT_FIRST_N_REPS;

  let baselineVelocities: number[] = [];
  let lastPeakVelocity: number | null = null;
  let totalRepsRecorded = 0;

  function getExpectedVelocity(): number | null {
    if (baselineVelocities.length < firstNReps) return null;
    return arithmeticMean(baselineVelocities);
  }

  return {
    recordRep(peakVelocity: number): void {
      totalRepsRecorded += 1;
      lastPeakVelocity = peakVelocity;
      if (baselineVelocities.length < firstNReps) {
        baselineVelocities.push(peakVelocity);
      }
    },

    getExpectedVelocity,

    getCurrentVelocityLossPct(): number | null {
      const expected = getExpectedVelocity();
      if (expected === null || lastPeakVelocity === null) return null;
      // A rep recorded during the baseline window is not a "loss" yet — we need
      // at least one rep AFTER the baseline to report loss.
      if (totalRepsRecorded <= firstNReps) return null;
      if (expected === 0) return 0;
      return ((expected - lastPeakVelocity) / expected) * 100;
    },

    reset(): void {
      baselineVelocities = [];
      lastPeakVelocity = null;
      totalRepsRecorded = 0;
    },
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

function arithmeticMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}
