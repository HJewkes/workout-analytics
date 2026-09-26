/**
 * Progression Rate - how fast lifts of one class climb inside a block, and how
 * fast they climb from one block's start to the next.
 *
 * The two differ: a lift can rise every week inside a block and start each
 * block where the last one started. A projection over several blocks needs the
 * start-to-start rate, not the in-block one.
 *
 * The class key is an opaque string from the caller's `classOf`, so this
 * module holds no class vocabulary of its own.
 */

import { analyzeTrend } from './trend';

/** The period a block belongs to when it names none. */
export const DEFAULT_PROGRESSION_PERIOD = 'all';

export interface ProgressionPoint {
  /** 'YYYY-MM-DD'. */
  day: string;
  /** A strength reading such as best e1RM; `null` points are skipped. */
  value: number | null;
}

export interface ProgressionSeriesInput {
  lift: string;
  points: readonly ProgressionPoint[];
}

export interface ProgressionBlock {
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive. */
  end: string;
  /** Blocks are compared start to start only within one period. */
  period?: string;
}

export interface LiftProgressionRate {
  lift: string;
  classKey: string;
  period: string;
  /** Points with a value inside the period's blocks. */
  sessions: number;
  /** Blocks in the period holding at least one of those points. */
  blocks: number;
  /** Median over blocks with two or more points of the in-block slope, percent of the block's first value per week. */
  inBlockPctPerWeek: number | null;
  /** Slope through each block's first value, percent of the first block's first value per week; needs two blocks. */
  startToStartPctPerWeek: number | null;
}

export interface SlopeSummary {
  median: number;
  /** Interquartile range edges, linearly interpolated. */
  q1: number;
  q3: number;
  /** Lifts contributing a slope. */
  n: number;
}

export interface ClassProgressionRate {
  classKey: string;
  period: string;
  lifts: number;
  sessions: number;
  inBlock: SlopeSummary | null;
  startToStart: SlopeSummary | null;
}

export interface ProgressionRates {
  byClass: ClassProgressionRate[];
  byLift: LiftProgressionRate[];
}

type ValuedPoint = { day: string; value: number };

/** Percent of the first value per week, from a least-squares fit over the points; `null` under two points. */
function pctPerWeek(points: readonly ValuedPoint[]): number | null {
  if (points.length < 2 || points[0].value === 0) return null;
  const { slope } = analyzeTrend(points.map((p) => ({ ts: p.day, value: p.value })));
  return ((slope * 7) / points[0].value) * 100;
}

function quantile(sorted: readonly number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function summarize(values: readonly (number | null)[]): SlopeSummary | null {
  const sorted = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return {
    median: quantile(sorted, 0.5),
    q1: quantile(sorted, 0.25),
    q3: quantile(sorted, 0.75),
    n: sorted.length,
  };
}

/** Each block's valued points, oldest first; empty blocks dropped. */
function pointsPerBlock(
  points: readonly ProgressionPoint[],
  blocks: readonly ProgressionBlock[]
): ValuedPoint[][] {
  const valued = points
    .filter((p): p is ValuedPoint => p.value !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  return blocks
    .map((block) => valued.filter((p) => p.day >= block.start && p.day <= block.end))
    .filter((inBlock) => inBlock.length > 0);
}

function liftRate(
  series: ProgressionSeriesInput,
  classKey: string,
  period: string,
  blocks: readonly ProgressionBlock[]
): LiftProgressionRate {
  const perBlock = pointsPerBlock(series.points, blocks);
  return {
    lift: series.lift,
    classKey,
    period,
    sessions: perBlock.reduce((sum, inBlock) => sum + inBlock.length, 0),
    blocks: perBlock.length,
    inBlockPctPerWeek: summarize(perBlock.map(pctPerWeek))?.median ?? null,
    startToStartPctPerWeek: pctPerWeek(perBlock.map((inBlock) => inBlock[0])),
  };
}

function blocksByPeriod(blocks: readonly ProgressionBlock[]): Map<string, ProgressionBlock[]> {
  const periods = new Map<string, ProgressionBlock[]>();
  const sorted = [...blocks].sort((a, b) => a.start.localeCompare(b.start));
  for (const block of sorted) {
    const period = block.period ?? DEFAULT_PROGRESSION_PERIOD;
    periods.set(period, [...(periods.get(period) ?? []), block]);
  }
  return periods;
}

function classRate(lifts: readonly LiftProgressionRate[]): ClassProgressionRate {
  return {
    classKey: lifts[0].classKey,
    period: lifts[0].period,
    lifts: lifts.length,
    sessions: lifts.reduce((sum, lift) => sum + lift.sessions, 0),
    inBlock: summarize(lifts.map((lift) => lift.inBlockPctPerWeek)),
    startToStart: summarize(lifts.map((lift) => lift.startToStartPctPerWeek)),
  };
}

/**
 * Per lift and period, the in-block and start-to-start rates; per class and
 * period, their median, IQR, and lift and session counts. A lift whose
 * `classOf` is `null` is left out, as is a lift with no point in a period.
 * Gating on counts is the caller's call: every summary carries its `n`.
 */
export function progressionRateByClass(
  series: readonly ProgressionSeriesInput[],
  blocks: readonly ProgressionBlock[],
  classOf: (lift: string) => string | null
): ProgressionRates {
  const byLift: LiftProgressionRate[] = [];
  for (const [period, periodBlocks] of blocksByPeriod(blocks)) {
    for (const lift of series) {
      const classKey = classOf(lift.lift);
      if (classKey === null) continue;
      const rate = liftRate(lift, classKey, period, periodBlocks);
      if (rate.sessions > 0) byLift.push(rate);
    }
  }
  const groups = new Map<string, LiftProgressionRate[]>();
  for (const rate of byLift) {
    const key = JSON.stringify([rate.classKey, rate.period]);
    groups.set(key, [...(groups.get(key) ?? []), rate]);
  }
  return { byClass: [...groups.values()].map(classRate), byLift };
}
