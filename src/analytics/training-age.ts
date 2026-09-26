/**
 * Training Age - how long a lift has been away, and how much of a history
 * counts as training.
 *
 * Pure and day-keyed: both reads take 'YYYY-MM-DD' training days and never a
 * clock, so the caller states which day "now" is.
 */

import { dayGaps, daysBetween, sortedDistinctDays, type DayGap } from './calendar-days';

/** A break of this many days or fewer is ordinary scheduling, not a layoff. */
export const BREAK_THRESHOLD_DAYS = 14;

export interface LiftBreak {
  /** The last training day strictly before `asOf`, or `null` when there is none. */
  lastBefore: string | null;
  /** `asOf` when it is a training day; `null` while the break is still running. */
  firstAfter: string | null;
  /** Days from `lastBefore` to `firstAfter`, or to `asOf` while the break runs. */
  days: number;
  inProgress: boolean;
  /** `days` is over `BREAK_THRESHOLD_DAYS`. */
  isBreak: boolean;
}

/**
 * The break that ends at `asOf`. Pass one lift's training days for a per-lift
 * break. When `asOf` is itself a training day the break is complete: the days
 * from the previous session with the lift to this one. Otherwise it is still
 * running and measured to `asOf`. `null` when no training day precedes `asOf`.
 */
export function breakLength(days: readonly string[], asOf: string): LiftBreak | null {
  const sorted = sortedDistinctDays(days);
  const before = sorted.filter((day) => day < asOf);
  if (before.length === 0) return null;
  const lastBefore = before[before.length - 1];
  const firstAfter = sorted.includes(asOf) ? asOf : null;
  const length = daysBetween(lastBefore, asOf);
  return {
    lastBefore,
    firstAfter,
    days: length,
    inProgress: firstAfter === null,
    isBreak: length > BREAK_THRESHOLD_DAYS,
  };
}

export interface EffectiveTrainingAgeOptions {
  /** A gap longer than this splits a run; the gap itself is not training. */
  maxGapDays: number;
  /** A gap longer than this is reported as excluded, for the lifter to see. */
  excludeGapDays: number;
}

/** Four weeks splits a run (RP's "a month or more"); six months is shown to the lifter. */
export const EFFECTIVE_TRAINING_AGE_DEFAULTS: Readonly<EffectiveTrainingAgeOptions> = {
  maxGapDays: 28,
  excludeGapDays: 183,
};

export interface TrainingAgeRun {
  first: string;
  last: string;
  /** Calendar days from `first` to `last`, both counted. */
  days: number;
}

export interface EffectiveTrainingAge {
  /** The sum of every run's days. */
  days: number;
  runs: TrainingAgeRun[];
  /** Every gap that split a run, oldest first. */
  splitGaps: DayGap[];
  /** The split gaps over `excludeGapDays`: not counted, and shown. */
  excludedGaps: DayGap[];
}

function runOf(first: string, last: string): TrainingAgeRun {
  return { first, last, days: daysBetween(first, last) + 1 };
}

function runsBetween(sorted: readonly string[], splits: readonly DayGap[]): TrainingAgeRun[] {
  const runs: TrainingAgeRun[] = [];
  let first = sorted[0];
  for (const gap of splits) {
    runs.push(runOf(first, gap.after));
    first = gap.endsOn;
  }
  runs.push(runOf(first, sorted[sorted.length - 1]));
  return runs;
}

/**
 * Training age counted only over runs with no gap longer than `maxGapDays`.
 * A gap of exactly `maxGapDays` stays inside its run.
 */
export function effectiveTrainingAge(
  days: readonly string[],
  options: Readonly<EffectiveTrainingAgeOptions> = EFFECTIVE_TRAINING_AGE_DEFAULTS
): EffectiveTrainingAge {
  const sorted = sortedDistinctDays(days);
  if (sorted.length === 0) return { days: 0, runs: [], splitGaps: [], excludedGaps: [] };
  const splitGaps = dayGaps(sorted).filter((gap) => gap.days > options.maxGapDays);
  const runs = runsBetween(sorted, splitGaps);
  return {
    days: runs.reduce((sum, run) => sum + run.days, 0),
    runs,
    splitGaps,
    excludedGaps: splitGaps.filter((gap) => gap.days > options.excludeGapDays),
  };
}
