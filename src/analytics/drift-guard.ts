/**
 * Drift Guard - execution-comparability gate for cross-session comparisons.
 *
 * Every cross-session verdict (progression detected, MRV exceeded,
 * underperformance) is an inference of the form "same work, different result".
 * That inference is only sound while the WORK was the same. A lifter who
 * shortens their range of motion or speeds up the concentric will move more
 * load at the same measured effort, and a naive comparison reads that as
 * progress; the reverse reads as fatigue. Neither is true.
 *
 * This module measures how far rep execution moved between two sets of sets
 * and answers one question: are these two sessions comparable at all?
 *
 * CONSUMER CONTRACT
 * -----------------
 * Callers (e.g. the future VW-91 / B04 MRV detector) MUST:
 *   - SKIP their comparison entirely when `comparable === false`. The two
 *     sessions describe different movements; any delta between them is
 *     uninterpretable, and reporting it anyway is worse than reporting
 *     nothing.
 *   - PROPAGATE `reasoning` as a caveat on whatever they emit when
 *     `flagged === true` and `comparable === true`. The comparison may fire,
 *     but the user is owed the reason it is shakier than usual.
 *
 * This module is pure and stateless: it derives everything from the reps it is
 * handed and persists nothing.
 */

import type { Set } from '@/models/set';
import { getRepRangeOfMotion } from '@/models/rep';
import { getRepConcentricTime } from '@/analytics/rep-analytics';
import { computeChange } from '@/analytics/types';

// =============================================================================
// Types
// =============================================================================

/** One side of a drift comparison: the execution shape of a group of sets. */
export interface DriftSummary {
  /** Median concentric movement time across qualifying reps, in seconds. */
  medianConcentricTempoS: number;
  /** Median concentric range of motion across qualifying reps, in metres. */
  medianRomM: number;
  /** Number of qualifying reps the medians were taken over. */
  repCount: number;
}

export interface DriftGuardVerdict {
  /** `false` ⇒ downstream MUST NOT fire a comparison across these sessions. */
  comparable: boolean;
  /** Signed: (current − baseline) / baseline × 100. Positive = slower tempo. */
  tempoDriftPct: number;
  /** Signed: (current − baseline) / baseline × 100. Positive = longer ROM. */
  romDriftPct: number;
  /** `true` with `comparable: true` ⇒ fire, but annotate with `reasoning`. */
  flagged: boolean;
  /** Human-readable explanation; always populated. */
  reasoning: string;
  thresholdsUsed: { tempoDriftPct: number; romDriftPct: number };
}

/**
 * Thresholds are expressed as percent-of-baseline so one number reads the same
 * across exercises, cable heights and lifter sizes.
 */
export const DRIFT_GUARD_THRESHOLDS = {
  /**
   * Hard tolerance on concentric-tempo drift. Matches the ~10–15 % band the
   * VBT/RIR protocol treats as a baseline SHIFT rather than ordinary
   * session-to-session noise; the top of that band is taken so ordinary
   * variation does not constantly flag.
   */
  tempoDriftPct: 15,
  /** Hard tolerance on ROM drift; same band and same reasoning as tempo. */
  romDriftPct: 15,
  /**
   * Soft-flag band. Between 1× and this multiple of the hard threshold
   * (15 %→22.5 %) the comparison still fires but carries a caveat; beyond it
   * the two sessions are treated as different movements and the comparison is
   * refused. A single cliff at 15 % would make a 15.1 % drift silently delete
   * a verdict that a 14.9 % drift emits confidently — the band makes that
   * transition gradual and legible to the user.
   */
  flaggedBandMultiplier: 1.5,
  /**
   * Below this many reps on either side, a median is a coin flip and the drift
   * number should not be trusted enough to block on. Mirrors
   * `BASELINE_THRESHOLDS.minRepsPerShapeSet` in voltras-mcp — the same floor
   * the baseline state machine uses to decide a set describes a movement.
   */
  minRepsForConfidentRead: 4,
} as const;

// =============================================================================
// Summarisation
// =============================================================================

/** Median of a non-empty array. Copies before sorting. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reduce a group of sets (one exercise, one session) to its execution shape.
 *
 * A rep qualifies only when it has BOTH a positive concentric time and a
 * positive ROM. Both helpers return 0 for "no measurement here" (a phase that
 * never started, a set closed mid-rep), and a 0 folded into a median drags it
 * toward a movement that was never performed.
 *
 * Medians, not means: a single mis-segmented rep with a 6-second concentric
 * would move a mean enough to manufacture drift on its own.
 *
 * Returns `undefined` when no rep qualifies — the absence of a read, which the
 * caller must distinguish from a read of zero drift.
 */
export function summarizeSetsForDrift(sets: readonly Set[]): DriftSummary | undefined {
  const tempos: number[] = [];
  const roms: number[] = [];

  for (const set of sets) {
    for (const rep of set.reps) {
      const tempo = getRepConcentricTime(rep);
      const rom = getRepRangeOfMotion(rep);
      if (tempo <= 0 || rom <= 0) continue;
      tempos.push(tempo);
      roms.push(rom);
    }
  }

  if (tempos.length === 0) return undefined;

  return {
    medianConcentricTempoS: median(tempos),
    medianRomM: median(roms),
    repCount: tempos.length,
  };
}

// =============================================================================
// Evaluation
// =============================================================================

/** Options for a drift evaluation. */
export interface DriftGuardOptions {
  tempoDriftPct?: number;
  romDriftPct?: number;
}

/** `"tempo drifted +18.2% (limit 15%)"` — shared phrasing for both metrics. */
function describeDrift(label: string, pct: number, limit: number): string {
  const signed = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}`;
  return `${label} drifted ${signed}% (limit ${Number(limit.toFixed(2))}%)`;
}

/** Names whichever of the two metrics breached its limit, phrased for prose. */
function namedBreaches(
  tempoDriftPct: number,
  romDriftPct: number,
  tempoLimit: number,
  romLimit: number
): string[] {
  const breaches: string[] = [];
  if (Math.abs(tempoDriftPct) > tempoLimit) {
    breaches.push(describeDrift('tempo', tempoDriftPct, tempoLimit));
  }
  if (Math.abs(romDriftPct) > romLimit) {
    breaches.push(describeDrift('ROM', romDriftPct, romLimit));
  }
  return breaches;
}

/**
 * Decide whether `current` is comparable to `baseline`.
 *
 * `options` overrides the hard thresholds only; the flagged band is always
 * `flaggedBandMultiplier` × whatever hard threshold is in force.
 *
 * The insufficient-reps case is checked FIRST and deliberately never blocks: a
 * drift number computed from two reps is not evidence strong enough to delete
 * a downstream verdict, only strong enough to caveat one.
 */
export function evaluateDriftGuard(
  baseline: DriftSummary,
  current: DriftSummary,
  // VW-92 hook: `experience_tier` could someday widen these tolerances for
  // advanced lifters, whose execution is more repeatable. NOT wired.
  options?: DriftGuardOptions
): DriftGuardVerdict {
  const tempoLimit = options?.tempoDriftPct ?? DRIFT_GUARD_THRESHOLDS.tempoDriftPct;
  const romLimit = options?.romDriftPct ?? DRIFT_GUARD_THRESHOLDS.romDriftPct;

  const tempoDriftPct = computeChange(
    baseline.medianConcentricTempoS,
    current.medianConcentricTempoS
  ).percentChange;
  const romDriftPct = computeChange(baseline.medianRomM, current.medianRomM).percentChange;

  const base = {
    tempoDriftPct,
    romDriftPct,
    thresholdsUsed: { tempoDriftPct: tempoLimit, romDriftPct: romLimit },
  };

  const minReps = DRIFT_GUARD_THRESHOLDS.minRepsForConfidentRead;
  if (baseline.repCount < minReps || current.repCount < minReps) {
    return {
      ...base,
      comparable: true,
      flagged: true,
      reasoning: 'insufficient reps for a reliable drift read',
    };
  }

  const band = DRIFT_GUARD_THRESHOLDS.flaggedBandMultiplier;
  const blocking = namedBreaches(tempoDriftPct, romDriftPct, tempoLimit * band, romLimit * band);
  if (blocking.length > 0) {
    return {
      ...base,
      comparable: false,
      flagged: true,
      reasoning: `${blocking.join(' and ')} — execution is too different to compare`,
    };
  }

  const soft = namedBreaches(tempoDriftPct, romDriftPct, tempoLimit, romLimit);
  if (soft.length > 0) {
    return {
      ...base,
      comparable: true,
      flagged: true,
      reasoning: `${soft.join(' and ')} — comparable, but treat the result as a caveat`,
    };
  }

  return {
    ...base,
    comparable: true,
    flagged: false,
    reasoning: 'tempo and ROM within tolerance',
  };
}
