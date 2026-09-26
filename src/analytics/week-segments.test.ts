import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { addDays } from './calendar-days';
import {
  BREAK_REASONS,
  SEGMENT_RULE,
  segmentWeeks,
  type LabelledWeek,
  type WeekSegmentFacts,
} from './week-segments';

const FIRST_MONDAY = '2030-01-07';
const monday = (week: number) => addDays(FIRST_MONDAY, 7 * week);

/** Training days for each listed week index: Monday, Tuesday, Thursday, Friday, cut to `sessions`. */
function days(weeks: readonly number[], sessions: (week: number) => number = () => 4): string[] {
  return weeks.flatMap((week) =>
    [0, 1, 3, 4].slice(0, sessions(week)).map((offset) => addDays(monday(week), offset))
  );
}

/** Every trained week logged set by set, with five exercises written out. */
function reported(weeks: readonly number[]): Map<string, number> {
  return new Map(weeks.map((week) => [monday(week), 5]));
}

function segment(
  weeks: readonly number[],
  options: {
    sessions?: (week: number) => number;
    reported?: Map<string, number>;
    bridged?: number[];
  } = {}
) {
  const facts: WeekSegmentFacts = {
    reportedExercises: options.reported ?? reported(weeks),
    bridgedGapWeeks: new Set((options.bridged ?? []).map(monday)),
  };
  return segmentWeeks(days(weeks, options.sessions), facts);
}

function labels(weeks: readonly LabelledWeek[]): Record<string, string> {
  return Object.fromEntries(
    weeks.map((w) => [w.week, w.label === 'broken' ? w.reasons.join('+') : w.label])
  );
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('segmentWeeks', () => {
  it('labels a steady run regular, all but its last two weeks, which are the tail', () => {
    const result = segment(range(0, 5));
    expect(labels(result.weeks)).toEqual({
      [monday(0)]: 'regular',
      [monday(1)]: 'regular',
      [monday(2)]: 'regular',
      [monday(3)]: 'regular',
      [monday(4)]: 'tail',
      [monday(5)]: 'tail',
    });
  });

  it('ends a run at an unbridged gap over 10 days, leaving a two-week run short', () => {
    const result = segment([0, 1, ...range(4, 9)]);
    expect(labels(result.weeks)).toMatchObject({
      [monday(0)]: 'short_run',
      [monday(1)]: 'short_run',
      [monday(2)]: 'untrained',
      [monday(4)]: 'regular',
    });
    expect(result.runs.map((r) => r.trainedWeeks)).toEqual([2, 6]);
  });

  it('keeps a run going across a gap the caller bridges', () => {
    const bridged = segment([0, 1, ...range(4, 9)], { bridged: [4] });
    expect(labels(bridged.weeks)[monday(0)]).toBe('regular');
    expect(bridged.gaps).toEqual([
      { week: monday(4), endsOn: monday(4), days: 17, breaksRun: false },
    ]);
  });

  it('does not break a run at a gap of exactly 10 days', () => {
    const result = segment([0, ...range(2, 7)]);
    expect(result.gaps).toEqual([]);
    expect(labels(result.weeks)).toMatchObject({
      [monday(0)]: 'regular',
      [monday(1)]: 'untrained',
    });
  });

  it('marks the first week after a gap over 21 days as a gap edge even when bridged', () => {
    const result = segment([0, 1, 2, ...range(6, 11)], { bridged: [6] });
    expect(labels(result.weeks)).toMatchObject({
      [monday(0)]: 'regular',
      [monday(6)]: 'gap_edge',
      [monday(7)]: 'regular',
    });
  });

  it('breaks a week under the modal count minus one and leaves it out of the steady count', () => {
    const result = segment(range(0, 5), { sessions: (week) => (week === 1 ? 2 : 4) });
    expect(labels(result.weeks)).toMatchObject({
      [monday(0)]: 'regular',
      [monday(1)]: 'low_frequency',
      [monday(2)]: 'regular',
    });
  });

  it('breaks every week of a run that holds fewer than three steady weeks', () => {
    const sparse = segment(range(0, 3), { sessions: (week) => (week % 2 === 1 ? 1 : 4) });
    expect(labels(sparse.weeks)[monday(0)]).toBe('short_run');
  });

  it('breaks a week where fewer than three exercises carry a written-out set', () => {
    const weeks = range(0, 5);
    const logged = reported(weeks).set(monday(2), 2);
    expect(labels(segment(weeks, { reported: logged }).weeks)[monday(2)]).toBe('sparse_logging');
  });

  it('never reads logging with sparse logging switched off', () => {
    const result = segmentWeeks(days(range(0, 5)), {}, { ...SEGMENT_RULE, sparseLogging: false });
    expect(labels(result.weeks)[monday(0)]).toBe('regular');
  });

  it('lists every reason that applies, tail first', () => {
    const weeks = range(0, 5);
    const logged = reported(weeks).set(monday(5), 0);
    const result = segment(weeks, { reported: logged, sessions: (w) => (w === 5 ? 1 : 4) });
    expect(result.weeks[5].reasons).toEqual(['tail', 'low_frequency', 'sparse_logging']);
  });

  it('segments no training days as nothing', () => {
    expect(segmentWeeks([])).toEqual({ modalSessionsPerWeek: null, weeks: [], runs: [], gaps: [] });
  });
});

describe('segmentWeeks properties', () => {
  const dayOffsets = fc.uniqueArray(fc.integer({ min: 0, max: 200 }), {
    minLength: 1,
    maxLength: 80,
  });
  const reportedCounts = fc.array(fc.integer({ min: 0, max: 6 }), {
    minLength: 30,
    maxLength: 30,
  });
  const reportedFor = (counts: readonly number[]) =>
    new Map(counts.map((count, week) => [monday(week), count]));

  it('gives every week one label, and every broken week reasons in precedence order', () => {
    fc.assert(
      fc.property(dayOffsets, reportedCounts, (offsets, counts) => {
        const result = segmentWeeks(
          offsets.map((o) => addDays(FIRST_MONDAY, o)),
          {
            reportedExercises: reportedFor(counts),
          }
        );
        expect(new Set(result.weeks.map((w) => w.week)).size).toBe(result.weeks.length);
        for (const week of result.weeks) {
          expect(week.reasons.length > 0).toBe(week.label === 'broken');
          const ranks = week.reasons.map((reason) => BREAK_REASONS.indexOf(reason));
          expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        }
      })
    );
  });

  it('never emits sparse_logging with it switched off', () => {
    fc.assert(
      fc.property(dayOffsets, reportedCounts, (offsets, counts) => {
        const result = segmentWeeks(
          offsets.map((o) => addDays(FIRST_MONDAY, o)),
          { reportedExercises: reportedFor(counts) },
          { ...SEGMENT_RULE, sparseLogging: false }
        );
        const reasons = result.weeks.flatMap((w) => w.reasons);
        expect(reasons).not.toContain('sparse_logging');
      })
    );
  });
});
