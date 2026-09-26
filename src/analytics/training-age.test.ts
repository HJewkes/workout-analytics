import { describe, it, expect } from 'vitest';
import { addDays } from './calendar-days';
import { breakLength, effectiveTrainingAge } from './training-age';

const START = '2030-01-07';
const day = (offset: number) => addDays(START, offset);

/** Training days every other day from `from` to `to` (offsets from START), inclusive of `from`. */
const everyOtherDay = (from: number, to: number) =>
  Array.from({ length: Math.floor((to - from) / 2) + 1 }, (_, i) => day(from + i * 2));

describe('breakLength', () => {
  it('reads a 14-day return as no break and a 15-day return as one', () => {
    expect(breakLength([day(0), day(14)], day(14))).toMatchObject({
      days: 14,
      isBreak: false,
      inProgress: false,
    });
    expect(breakLength([day(0), day(15)], day(15))).toMatchObject({ days: 15, isBreak: true });
  });

  it('measures a break still running to the day asked about', () => {
    expect(breakLength([day(0), day(3)], day(40))).toEqual({
      lastBefore: day(3),
      firstAfter: null,
      days: 37,
      inProgress: true,
      isBreak: true,
    });
  });

  it('has no break before the first training day', () => {
    expect(breakLength([day(5)], day(5))).toBeNull();
  });

  it('reads unsorted, repeated days the same as sorted ones', () => {
    expect(breakLength([day(20), day(0), day(0)], day(20))).toMatchObject({
      lastBefore: day(0),
      firstAfter: day(20),
    });
  });
});

describe('effectiveTrainingAge', () => {
  it('keeps a 28-day gap inside its run and splits at 29', () => {
    expect(effectiveTrainingAge([day(0), day(28)]).runs).toHaveLength(1);
    expect(effectiveTrainingAge([day(0), day(29)]).runs).toHaveLength(2);
  });

  it('splits the run at a 64-day gap and counts only the two runs', () => {
    const days = [...everyOtherDay(0, 20), ...everyOtherDay(84, 104)];
    const age = effectiveTrainingAge(days);
    expect(age.runs).toEqual([
      { first: day(0), last: day(20), days: 21 },
      { first: day(84), last: day(104), days: 21 },
    ]);
    expect(age.days).toBe(42);
    expect(age.splitGaps).toEqual([{ after: day(20), endsOn: day(84), days: 64 }]);
    expect(age.excludedGaps).toEqual([]);
  });

  it('excludes and reports a 200-day gap', () => {
    const age = effectiveTrainingAge([...everyOtherDay(0, 10), ...everyOtherDay(210, 220)]);
    expect(age.days).toBe(22);
    expect(age.excludedGaps).toEqual([{ after: day(10), endsOn: day(210), days: 200 }]);
  });

  it('honours caller thresholds', () => {
    const age = effectiveTrainingAge([day(0), day(10)], { maxGapDays: 7, excludeGapDays: 9 });
    expect(age.excludedGaps).toHaveLength(1);
  });

  it('reads an empty history as zero', () => {
    expect(effectiveTrainingAge([])).toEqual({
      days: 0,
      runs: [],
      splitGaps: [],
      excludedGaps: [],
    });
  });
});
