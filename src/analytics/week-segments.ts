/**
 * Week Segments - which calendar weeks of a training history read as steady
 * training, and why every other trained week does not.
 *
 * Pure and day-keyed: the input is the list of training days plus optional
 * per-week facts, so a logged history and live sessions segment the same way.
 */

import { dayGaps, isoWeekStart, sortedDistinctDays, weeksSpanning } from './calendar-days';

export interface SegmentRule {
  /** A gap between training days longer than this ends a run, unless the caller bridges it. */
  breakGapDays: number;
  /** A run needs this many steady weeks before any of its weeks reads regular. */
  minRunWeeks: number;
  /** A regular week holds at least the modal weekly session count minus this. */
  frequencySlack: number;
  /** The last this-many trained weeks of the history are the tail, still open. */
  tailWeeks: number;
  /** The first trained week after a gap longer than this is a re-entry week, bridged or not. */
  longGapDays: number;
  /** Whether a week with few written-out exercises is broken; off for live sessions, which log every set. */
  sparseLogging: boolean;
  /** With `sparseLogging` on, a steady week holds at least this many exercises with a written-out set. */
  minReportedExercises: number;
}

/**
 * ENGINEERING DEFAULT: tuned against one coached log. Callers with a different
 * source (live sessions) should pass their own rule rather than rely on these.
 */
export const SEGMENT_RULE: Readonly<SegmentRule> = {
  breakGapDays: 10,
  minRunWeeks: 3,
  frequencySlack: 1,
  tailWeeks: 2,
  longGapDays: 21,
  sparseLogging: true,
  minReportedExercises: 3,
};

/** In precedence order: a week's first reason is the one a view colours it by. */
export const BREAK_REASONS = [
  'tail',
  'gap_edge',
  'short_run',
  'low_frequency',
  'sparse_logging',
] as const;
export type BreakReason = (typeof BREAK_REASONS)[number];

export type WeekLabel = 'regular' | 'broken' | 'untrained';

export interface WeekSegmentFacts {
  /** Distinct exercises with a written-out set, keyed by ISO week Monday. Read only with `sparseLogging` on. */
  reportedExercises?: ReadonlyMap<string, number>;
  /** Weeks (ISO Monday) where a long gap ends but the caller rules the run did not: a planned deload, say. */
  bridgedGapWeeks?: ReadonlySet<string>;
}

export interface LabelledWeek {
  /** ISO week Monday. */
  week: string;
  sessions: number;
  reportedExercises: number;
  /** Index into `runs`, or `null` for a week with no training. */
  run: number | null;
  label: WeekLabel;
  /** Empty unless `label` is 'broken'; in `BREAK_REASONS` order. */
  reasons: BreakReason[];
}

export interface TrainingRun {
  firstWeek: string;
  lastWeek: string;
  trainedWeeks: number;
}

export interface LongGap {
  /** The week training resumed in. */
  week: string;
  /** The first training day after the gap. */
  endsOn: string;
  days: number;
  breaksRun: boolean;
}

export interface WeekSegmentation {
  modalSessionsPerWeek: number | null;
  weeks: LabelledWeek[];
  runs: TrainingRun[];
  gaps: LongGap[];
}

/** Training days per ISO week from the first day's week to the last, zero weeks included. */
export function sessionsPerWeek(days: readonly string[]): Map<string, number> {
  const sorted = sortedDistinctDays(days);
  if (sorted.length === 0) return new Map();
  const counts = new Map(weeksSpanning(sorted[0], sorted[sorted.length - 1]).map((w) => [w, 0]));
  for (const day of sorted) counts.set(isoWeekStart(day), (counts.get(isoWeekStart(day)) ?? 0) + 1);
  return counts;
}

/** The most common non-zero weekly count; ties go to the higher count, the lifter's fuller week. */
export function modalWeeklyCount(counts: Iterable<number>): number | null {
  const frequency = new Map<number, number>();
  for (const count of counts) if (count > 0) frequency.set(count, (frequency.get(count) ?? 0) + 1);
  let best: number | null = null;
  let bestSeen = 0;
  for (const [count, seen] of frequency) {
    if (seen > bestSeen || (seen === bestSeen && best !== null && count > best)) {
      best = count;
      bestSeen = seen;
    }
  }
  return best;
}

function longGaps(days: readonly string[], rule: SegmentRule, facts: WeekSegmentFacts): LongGap[] {
  return dayGaps(sortedDistinctDays(days))
    .filter((gap) => gap.days > rule.breakGapDays)
    .map((gap) => {
      const week = isoWeekStart(gap.endsOn);
      const bridged = facts.bridgedGapWeeks?.has(week) ?? false;
      return { week, endsOn: gap.endsOn, days: gap.days, breaksRun: !bridged };
    });
}

/** Trained weeks grouped into runs, a new run starting at each week a breaking gap ends in. */
function runsOf(trained: readonly string[], breakWeeks: ReadonlySet<string>): string[][] {
  const runs: string[][] = [];
  for (const week of trained) {
    if (runs.length === 0 || breakWeeks.has(week)) runs.push([]);
    runs[runs.length - 1].push(week);
  }
  return runs;
}

interface SegmentContext {
  rule: SegmentRule;
  perWeek: ReadonlyMap<string, number>;
  reported: ReadonlyMap<string, number>;
  floor: number | null;
}

function frequentEnough(week: string, ctx: SegmentContext): boolean {
  return ctx.floor === null || (ctx.perWeek.get(week) ?? 0) >= ctx.floor;
}

function sparselyLogged(week: string, ctx: SegmentContext): boolean {
  return ctx.rule.sparseLogging && (ctx.reported.get(week) ?? 0) < ctx.rule.minReportedExercises;
}

function steady(week: string, ctx: SegmentContext): boolean {
  return frequentEnough(week, ctx) && !sparselyLogged(week, ctx);
}

interface RunLayout {
  runIndex: ReadonlyMap<string, number>;
  steadyPerRun: readonly number[];
  tail: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

function reasonsFor(week: string, run: number, layout: RunLayout, ctx: SegmentContext) {
  const checks: Record<BreakReason, boolean> = {
    tail: layout.tail.has(week),
    gap_edge: layout.edges.has(week),
    short_run: layout.steadyPerRun[run] < ctx.rule.minRunWeeks,
    low_frequency: !frequentEnough(week, ctx),
    sparse_logging: sparselyLogged(week, ctx),
  };
  return BREAK_REASONS.filter((reason) => checks[reason]);
}

function labelWeek(week: string, layout: RunLayout, ctx: SegmentContext): LabelledWeek {
  const run = layout.runIndex.get(week) ?? null;
  const sessions = ctx.perWeek.get(week) ?? 0;
  const base = { week, sessions, reportedExercises: ctx.reported.get(week) ?? 0, run };
  if (run === null) return { ...base, label: 'untrained', reasons: [] };
  const reasons = reasonsFor(week, run, layout, ctx);
  return { ...base, label: reasons.length > 0 ? 'broken' : 'regular', reasons };
}

function runJson(weeks: readonly string[]): TrainingRun {
  return { firstWeek: weeks[0], lastWeek: weeks[weeks.length - 1], trainedWeeks: weeks.length };
}

function contextOf(days: readonly string[], rule: SegmentRule, facts: WeekSegmentFacts) {
  const perWeek = sessionsPerWeek(days);
  const modal = modalWeeklyCount(perWeek.values());
  const ctx: SegmentContext = {
    rule,
    perWeek,
    reported: facts.reportedExercises ?? new Map(),
    floor: modal === null ? null : modal - rule.frequencySlack,
  };
  return { ctx, modal };
}

/**
 * Every calendar week from the first training day's week to the last, labelled.
 *
 * A run is a stretch of trained weeks with no gap between training days over
 * `breakGapDays`, unless the caller bridges that gap. A trained week is steady
 * when it holds at least the modal weekly count minus `frequencySlack` sessions
 * and, with `sparseLogging` on, enough written-out exercises. A week is
 * regular when it is steady, its run holds at least `minRunWeeks` steady
 * weeks, and it is neither in the tail nor the first week after a gap over
 * `longGapDays`. Every other trained week is broken, with every reason that
 * applies.
 */
export function segmentWeeks(
  days: readonly string[],
  facts: WeekSegmentFacts = {},
  rule: Readonly<SegmentRule> = SEGMENT_RULE
): WeekSegmentation {
  const { ctx, modal } = contextOf(days, rule, facts);
  const gaps = longGaps(days, rule, facts);
  const trained = [...ctx.perWeek].filter(([, n]) => n > 0).map(([week]) => week);
  const runs = runsOf(trained, new Set(gaps.filter((g) => g.breaksRun).map((g) => g.week)));
  const layout: RunLayout = {
    runIndex: new Map(runs.flatMap((run, i) => run.map((week) => [week, i] as const))),
    steadyPerRun: runs.map((run) => run.filter((week) => steady(week, ctx)).length),
    tail: new Set(rule.tailWeeks > 0 ? trained.slice(-rule.tailWeeks) : []),
    edges: new Set(gaps.filter((g) => g.days > rule.longGapDays).map((g) => g.week)),
  };
  const weeks = [...ctx.perWeek.keys()].map((week) => labelWeek(week, layout, ctx));
  return { modalSessionsPerWeek: modal, weeks, runs: runs.map(runJson), gaps };
}
