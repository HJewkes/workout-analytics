import { describe, it, expect } from 'vitest';
import { addDays } from './calendar-days';
import {
  progressionRateByClass,
  type ProgressionBlock,
  type ProgressionPoint,
} from './progression-rate';

const START = '2030-01-07';
const day = (offset: number) => addDays(START, offset);

/** Four weekly sessions from `offset`, climbing `step` a week from `startValue`. */
function block(offset: number, startValue: number, step: number): ProgressionPoint[] {
  return [0, 7, 14, 21].map((week, i) => ({
    day: day(offset + week),
    value: startValue + i * step,
  }));
}

/** Two blocks that restart at the same value, the second climbing faster. */
const SAWTOOTH = [...block(0, 100, 5), ...block(28, 100, 10)];

const TWO_BLOCKS: ProgressionBlock[] = [
  { start: day(0), end: day(27) },
  { start: day(28), end: day(55) },
];

describe('progressionRateByClass', () => {
  it('reads a within-block climb as in-block progress and a flat restart as none', () => {
    const rates = progressionRateByClass(
      [{ lift: 'press', points: SAWTOOTH }],
      TWO_BLOCKS,
      () => 'upper'
    );
    const [lift] = rates.byLift;
    expect(lift.inBlockPctPerWeek).toBeCloseTo(7.5, 9);
    expect(lift.startToStartPctPerWeek).toBeCloseTo(0, 9);
  });

  it('measures start-to-start from block starts, not block ends', () => {
    const points = [...block(0, 100, 5), ...block(28, 110, 0)];
    const [lift] = progressionRateByClass(
      [{ lift: 'press', points }],
      TWO_BLOCKS,
      () => 'x'
    ).byLift;
    expect(lift.startToStartPctPerWeek).toBeCloseTo((10 / 4 / 100) * 100, 9);
  });

  it('summarizes per class with median, IQR and counts, skipping unclassed lifts', () => {
    const rising = (lift: string, step: number) => ({
      lift,
      points: [0, 28, 56].map((offset, i) => ({ day: day(offset), value: 100 + i * step })),
    });
    const blocks = [...TWO_BLOCKS, { start: day(56), end: day(83) }];
    const rates = progressionRateByClass(
      [rising('a', 4), rising('b', 8), rising('c', 12), rising('skip', 40)],
      blocks,
      (lift) => (lift === 'skip' ? null : 'lower')
    );
    expect(rates.byClass).toHaveLength(1);
    const [lower] = rates.byClass;
    expect(lower).toMatchObject({ classKey: 'lower', period: 'all', lifts: 3, sessions: 9 });
    expect(lower.startToStart).toMatchObject({ median: 2, q1: 1.5, q3: 2.5, n: 3 });
    expect(lower.inBlock).toBeNull();
  });

  it('keeps periods apart and never compares starts across them', () => {
    const blocks: ProgressionBlock[] = [
      { ...TWO_BLOCKS[0], period: 'p1' },
      { ...TWO_BLOCKS[1], period: 'p2' },
    ];
    const rates = progressionRateByClass(
      [{ lift: 'press', points: SAWTOOTH }],
      blocks,
      () => 'upper'
    );
    expect(rates.byLift.map((r) => [r.period, r.blocks, r.startToStartPctPerWeek])).toEqual([
      ['p1', 1, null],
      ['p2', 1, null],
    ]);
  });

  it('skips null readings and points outside every block', () => {
    const [lift] = progressionRateByClass(
      [
        {
          lift: 'press',
          points: [
            { day: day(0), value: null },
            { day: day(7), value: 100 },
            { day: day(200), value: 500 },
          ],
        },
      ],
      TWO_BLOCKS,
      () => 'upper'
    ).byLift;
    expect(lift).toMatchObject({ sessions: 1, blocks: 1, inBlockPctPerWeek: null });
  });
});
