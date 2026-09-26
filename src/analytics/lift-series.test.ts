import { describe, it, expect } from 'vitest';
import { buildLiftSeries, modalRepCount, MAX_E1RM_REPS, type LiftSetInput } from './lift-series';

const set = (day: string, load: number, reps: number, sets = 1): LiftSetInput => ({
  day,
  load,
  reps,
  sets,
});

describe('buildLiftSeries', () => {
  it('gives no e1RM for a day whose only set runs past twelve reps', () => {
    const series = buildLiftSeries([set('2030-01-07', 100, 13)]);
    expect(series.points[0].bestE1RM).toBeNull();
  });

  it('gives an Epley e1RM for a twelve-rep set', () => {
    const series = buildLiftSeries([set('2030-01-07', 100, MAX_E1RM_REPS)]);
    expect(series.points[0].bestE1RM).toBeCloseTo(140, 9);
  });

  it('ignores a set of fifteen reps when picking the best e1RM of the day', () => {
    const series = buildLiftSeries([set('2030-01-07', 100, 10), set('2030-01-07', 110, 15)]);
    expect(series.points[0].bestE1RM).toBeCloseTo(100 * (1 + 10 / 30), 9);
  });

  it('reads top load at the modal reps and ignores a heavier two-rep single', () => {
    const series = buildLiftSeries([
      set('2030-01-07', 100, 8, 3),
      set('2030-01-14', 105, 8, 3),
      set('2030-01-14', 140, 2),
    ]);
    expect(series.modalReps).toBe(8);
    expect(series.points[1]).toMatchObject({ topLoadAtModal: 105, topLoad: 140 });
  });

  it('counts a set carried for more than the modal reps at the modal-rep top load', () => {
    const series = buildLiftSeries([
      set('2030-01-07', 100, 8),
      set('2030-01-07', 100, 8),
      set('2030-01-14', 110, 10),
    ]);
    expect(series.points[1].topLoadAtModal).toBe(110);
  });

  it('has no modal-rep load on a day that never reached the modal reps', () => {
    const series = buildLiftSeries([
      set('2030-01-07', 100, 8),
      set('2030-01-08', 100, 8),
      set('2030-01-14', 130, 3),
    ]);
    expect(series.points[2].topLoadAtModal).toBeNull();
  });

  it('orders days oldest first and totals sets and reps per day', () => {
    const series = buildLiftSeries([set('2030-01-14', 100, 5, 2), set('2030-01-07', 90, 6, 3)]);
    expect(series.points.map((p) => p.day)).toEqual(['2030-01-07', '2030-01-14']);
    expect(series.points[0]).toMatchObject({ sets: 3, totalReps: 18 });
  });

  it('drops unloaded, zero-rep and zero-set lines', () => {
    const series = buildLiftSeries([
      set('2030-01-07', 0, 8),
      set('2030-01-08', 100, 0),
      set('2030-01-09', 100, 8, 0),
    ]);
    expect(series).toEqual({ modalReps: null, points: [] });
  });
});

describe('modalRepCount', () => {
  it('breaks a tie toward the lower, heavier rep count', () => {
    expect(modalRepCount([set('d', 1, 5), set('d', 1, 8)])).toBe(5);
  });

  it('counts set lines, not the sets they hold', () => {
    expect(modalRepCount([set('d', 1, 5, 4), set('d', 1, 8), set('d', 1, 8)])).toBe(8);
  });
});
