/**
 * Time Series Tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildTimeSeries,
  getWeeklySummaries,
  getVolumeByMuscleGroup,
  type ProcessedSession,
} from '@/analytics/time-series';

// =============================================================================
// Test Fixtures
// =============================================================================

function makeSession(overrides: Partial<ProcessedSession> = {}): ProcessedSession {
  return {
    id: overrides.id ?? 'sess-1',
    startedAt: overrides.startedAt ?? '2026-04-06T10:00:00.000Z', // a Monday
    exerciseId: overrides.exerciseId,
    sets: overrides.sets ?? [
      { weightLbs: 100, repCount: 5, velocityMean: 0.8, velocityLoss: 10, estimated1rm: 115 },
      { weightLbs: 100, repCount: 5, velocityMean: 0.7, velocityLoss: 15, estimated1rm: 117 },
    ],
  };
}

// =============================================================================
// buildTimeSeries
// =============================================================================

describe('buildTimeSeries', () => {
  it('returns empty series for empty sessions', () => {
    const series = buildTimeSeries([], { metric: 'volume' });
    expect(series.points).toEqual([]);
    expect(series.metric).toBe('volume');
    expect(series.bucketBy).toBe('session');
  });

  it('produces 1 point for a single session', () => {
    const series = buildTimeSeries([makeSession()], { metric: 'volume' });
    expect(series.points).toHaveLength(1);
    expect(series.points[0].value).toBe(1000); // 100*5 + 100*5
  });

  it("produces 1 point per session with bucketBy='session'", () => {
    const sessions = [
      makeSession({ id: 's1', startedAt: '2026-04-01T10:00:00.000Z' }),
      makeSession({ id: 's2', startedAt: '2026-04-02T10:00:00.000Z' }),
      makeSession({ id: 's3', startedAt: '2026-04-03T10:00:00.000Z' }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'volume', bucketBy: 'session' });
    expect(series.points).toHaveLength(3);
  });

  it("collapses same-week sessions to 1 point with bucketBy='week'", () => {
    // Both 2026-04-06 (Mon) and 2026-04-08 (Wed) are in the same ISO week.
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-08T10:00:00.000Z',
        sets: [{ weightLbs: 200, repCount: 3 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'volume', bucketBy: 'week' });
    expect(series.points).toHaveLength(1);
    expect(series.points[0].value).toBe(500 + 600); // sums within week
    expect(series.points[0].timestamp).toBe('2026-04-06T00:00:00.000Z');
  });

  it("collapses same-day sessions to 1 point with bucketBy='day'", () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T08:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-06T18:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'volume', bucketBy: 'day' });
    expect(series.points).toHaveLength(1);
    expect(series.points[0].value).toBe(1000);
    expect(series.points[0].timestamp).toBe('2026-04-06T00:00:00.000Z');
  });

  it('filters by exerciseId', () => {
    const sessions = [
      makeSession({ id: 's1', exerciseId: 'cable_row' }),
      makeSession({ id: 's2', exerciseId: 'bench_press' }),
      makeSession({ id: 's3', exerciseId: 'cable_row' }),
    ];
    const series = buildTimeSeries(sessions, {
      metric: 'volume',
      exerciseId: 'cable_row',
    });
    expect(series.points).toHaveLength(2);
    expect(series.exerciseId).toBe('cable_row');
  });

  it('excludes sessions outside fromTs/toTs window', () => {
    const sessions = [
      makeSession({ id: 's1', startedAt: '2026-03-15T10:00:00.000Z' }),
      makeSession({ id: 's2', startedAt: '2026-04-01T10:00:00.000Z' }),
      makeSession({ id: 's3', startedAt: '2026-04-15T10:00:00.000Z' }),
      makeSession({ id: 's4', startedAt: '2026-05-01T10:00:00.000Z' }),
    ];
    const series = buildTimeSeries(sessions, {
      metric: 'volume',
      fromTs: '2026-04-01T00:00:00.000Z',
      toTs: '2026-04-30T23:59:59.000Z',
    });
    expect(series.points).toHaveLength(2);
    const ids = series.points.flatMap((p) => (p.metadata?.sessionIds as string[]) ?? []);
    expect(ids).toEqual(['s2', 's3']);
  });

  it('velocity_mean takes mean within bucket', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5, velocityMean: 0.8 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5, velocityMean: 0.6 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'velocity_mean', bucketBy: 'week' });
    expect(series.points[0].value).toBeCloseTo(0.7);
  });

  it('velocity_loss takes mean within bucket', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5, velocityLoss: 10 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5, velocityLoss: 30 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'velocity_loss', bucketBy: 'week' });
    expect(series.points[0].value).toBeCloseTo(20);
  });

  it('volume sums within bucket', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        sets: [{ weightLbs: 200, repCount: 5 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'volume', bucketBy: 'week' });
    expect(series.points[0].value).toBe(500 + 1000);
  });

  it('top_weight takes max within bucket', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        sets: [{ weightLbs: 250, repCount: 5 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'top_weight', bucketBy: 'week' });
    expect(series.points[0].value).toBe(250);
  });

  it('estimated_1rm takes max within bucket', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5, estimated1rm: 115 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        sets: [{ weightLbs: 110, repCount: 5, estimated1rm: 130 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'estimated_1rm', bucketBy: 'week' });
    expect(series.points[0].value).toBe(130);
  });

  it('drops sessions with no contributing data for the metric', () => {
    const sessions = [
      makeSession({
        id: 's1',
        sets: [{ weightLbs: 100, repCount: 5, velocityMean: 0.8 }],
      }),
      // No velocityMean → contributes nothing to velocity_mean series.
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'velocity_mean' });
    expect(series.points).toHaveLength(1);
  });

  it('drops sessions with no sets at all', () => {
    const sessions = [makeSession({ id: 's1', sets: [] })];
    const series = buildTimeSeries(sessions, { metric: 'volume' });
    expect(series.points).toEqual([]);
  });

  it('sorts points ascending by timestamp', () => {
    const sessions = [
      makeSession({ id: 's3', startedAt: '2026-04-03T10:00:00.000Z' }),
      makeSession({ id: 's1', startedAt: '2026-04-01T10:00:00.000Z' }),
      makeSession({ id: 's2', startedAt: '2026-04-02T10:00:00.000Z' }),
    ];
    const series = buildTimeSeries(sessions, { metric: 'volume' });
    const timestamps = series.points.map((p) => p.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });
});

// =============================================================================
// getWeeklySummaries
// =============================================================================

describe('getWeeklySummaries', () => {
  it('returns empty for no sessions', () => {
    expect(getWeeklySummaries([])).toEqual([]);
  });

  it('caps at 12 by default', () => {
    // 20 sessions in 20 distinct weeks
    const sessions: ProcessedSession[] = [];
    for (let i = 0; i < 20; i++) {
      sessions.push(
        makeSession({
          id: `s${i}`,
          startedAt: new Date(Date.UTC(2026, 0, 5 + i * 7, 10)).toISOString(),
        })
      );
    }
    const result = getWeeklySummaries(sessions);
    expect(result).toHaveLength(12);
  });

  it('honors custom n', () => {
    const sessions: ProcessedSession[] = [];
    for (let i = 0; i < 5; i++) {
      sessions.push(
        makeSession({
          id: `s${i}`,
          startedAt: new Date(Date.UTC(2026, 0, 5 + i * 7, 10)).toISOString(),
        })
      );
    }
    const result = getWeeklySummaries(sessions, 3);
    expect(result).toHaveLength(3);
  });

  it('groups sessions by ISO Monday-anchored week', () => {
    const sessions = [
      // Mon 2026-04-06
      makeSession({ id: 's1', startedAt: '2026-04-06T10:00:00.000Z' }),
      // Wed 2026-04-08 (same week)
      makeSession({ id: 's2', startedAt: '2026-04-08T10:00:00.000Z' }),
      // Sun 2026-04-12 (still same ISO week — Mon 2026-04-06 → Sun 2026-04-12)
      makeSession({ id: 's3', startedAt: '2026-04-12T22:00:00.000Z' }),
      // Mon 2026-04-13 (next week)
      makeSession({ id: 's4', startedAt: '2026-04-13T10:00:00.000Z' }),
    ];
    const result = getWeeklySummaries(sessions);
    expect(result).toHaveLength(2);
    const weekOfApr6 = result.find((w) => w.weekStart === '2026-04-06');
    const weekOfApr13 = result.find((w) => w.weekStart === '2026-04-13');
    expect(weekOfApr6?.sessionCount).toBe(3);
    expect(weekOfApr13?.sessionCount).toBe(1);
  });

  it('topWeightLbs is max within week', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-08T10:00:00.000Z',
        sets: [
          { weightLbs: 250, repCount: 1 },
          { weightLbs: 200, repCount: 5 },
        ],
      }),
    ];
    const result = getWeeklySummaries(sessions);
    expect(result[0].topWeightLbs).toBe(250);
  });

  it('totalVolumeLbs sums within week', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        sets: [{ weightLbs: 100, repCount: 5 }], // 500
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-08T10:00:00.000Z',
        sets: [{ weightLbs: 200, repCount: 3 }], // 600
      }),
    ];
    const result = getWeeklySummaries(sessions);
    expect(result[0].totalVolumeLbs).toBe(1100);
  });

  it('exerciseIds is distinct sorted list', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-04-06T10:00:00.000Z',
        exerciseId: 'cable_row',
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-07T10:00:00.000Z',
        exerciseId: 'bench_press',
      }),
      makeSession({
        id: 's3',
        startedAt: '2026-04-08T10:00:00.000Z',
        exerciseId: 'cable_row', // duplicate
      }),
    ];
    const result = getWeeklySummaries(sessions);
    expect(result[0].exerciseIds).toEqual(['bench_press', 'cable_row']);
  });

  it('returns weeks sorted descending (most recent first)', () => {
    const sessions = [
      makeSession({ id: 's1', startedAt: '2026-03-02T10:00:00.000Z' }),
      makeSession({ id: 's2', startedAt: '2026-04-06T10:00:00.000Z' }),
      makeSession({ id: 's3', startedAt: '2026-02-02T10:00:00.000Z' }),
    ];
    const result = getWeeklySummaries(sessions);
    const order = result.map((w) => w.weekStart);
    expect(order).toEqual(['2026-04-06', '2026-03-02', '2026-02-02']);
  });

  it('topWeightLbs is null when no sets', () => {
    const sessions = [makeSession({ id: 's1', sets: [] })];
    const result = getWeeklySummaries(sessions);
    expect(result[0].topWeightLbs).toBeNull();
  });
});

// =============================================================================
// getVolumeByMuscleGroup
// =============================================================================

describe('getVolumeByMuscleGroup', () => {
  it('returns empty result for no sessions', () => {
    const result = getVolumeByMuscleGroup([], () => undefined);
    expect(result.totalVolumeLbs).toBe(0);
    expect(result.byMuscleGroup).toEqual({});
  });

  it('attributes single-muscle exercise volume to that group', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 50, repCount: 10 }],
      }),
    ];
    const lookup = (id: string) =>
      id === 'biceps_curl' ? { muscleGroups: ['biceps'] } : undefined;

    const result = getVolumeByMuscleGroup(sessions, lookup);
    expect(result.byMuscleGroup).toEqual({ biceps: 500 });
    expect(result.totalVolumeLbs).toBe(500);
  });

  it('splits multi-muscle exercise volume evenly across groups', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exerciseId: 'bench_press',
        sets: [{ weightLbs: 100, repCount: 10 }], // 1000 total
      }),
    ];
    const lookup = (id: string) =>
      id === 'bench_press' ? { muscleGroups: ['chest', 'triceps', 'shoulders'] } : undefined;

    const result = getVolumeByMuscleGroup(sessions, lookup);
    expect(result.byMuscleGroup.chest).toBeCloseTo(1000 / 3);
    expect(result.byMuscleGroup.triceps).toBeCloseTo(1000 / 3);
    expect(result.byMuscleGroup.shoulders).toBeCloseTo(1000 / 3);
    expect(result.totalVolumeLbs).toBe(1000);
  });

  it('respects period filter', () => {
    const sessions = [
      makeSession({
        id: 's1',
        startedAt: '2026-03-15T10:00:00.000Z',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 50, repCount: 10 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-15T10:00:00.000Z',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 50, repCount: 10 }],
      }),
      makeSession({
        id: 's3',
        startedAt: '2026-05-15T10:00:00.000Z',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 50, repCount: 10 }],
      }),
    ];
    const lookup = (id: string) =>
      id === 'biceps_curl' ? { muscleGroups: ['biceps'] } : undefined;

    const result = getVolumeByMuscleGroup(sessions, lookup, {
      from: '2026-04-01T00:00:00.000Z',
      to: '2026-04-30T23:59:59.000Z',
    });
    expect(result.byMuscleGroup.biceps).toBe(500); // only the april session
    expect(result.totalVolumeLbs).toBe(500);
    expect(result.period.from).toBe('2026-04-01T00:00:00.000Z');
    expect(result.period.to).toBe('2026-04-30T23:59:59.000Z');
  });

  it('skips attribution when exerciseId is unknown to the lookup', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exerciseId: 'mystery_lift',
        sets: [{ weightLbs: 100, repCount: 5 }], // 500
      }),
      makeSession({
        id: 's2',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 50, repCount: 10 }], // 500
      }),
    ];
    const lookup = (id: string) =>
      id === 'biceps_curl' ? { muscleGroups: ['biceps'] } : undefined;

    const result = getVolumeByMuscleGroup(sessions, lookup);
    // unknown exercise NOT attributed to any muscle group
    expect(result.byMuscleGroup).toEqual({ biceps: 500 });
    // but its volume IS counted in the total — so callers can detect gaps
    expect(result.totalVolumeLbs).toBe(1000);
  });

  it('skips attribution when session has no exerciseId', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exerciseId: undefined,
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
    ];
    const result = getVolumeByMuscleGroup(sessions, () => ({
      muscleGroups: ['biceps'],
    }));
    expect(result.byMuscleGroup).toEqual({});
    expect(result.totalVolumeLbs).toBe(500);
  });

  it('skips attribution when exercise has empty muscleGroups list', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exerciseId: 'unspecified',
        sets: [{ weightLbs: 100, repCount: 5 }],
      }),
    ];
    const result = getVolumeByMuscleGroup(sessions, () => ({ muscleGroups: [] }));
    expect(result.byMuscleGroup).toEqual({});
    expect(result.totalVolumeLbs).toBe(500);
  });

  it('aggregates same muscle group across multiple sessions', () => {
    const sessions = [
      makeSession({
        id: 's1',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 50, repCount: 10 }],
      }),
      makeSession({
        id: 's2',
        startedAt: '2026-04-08T10:00:00.000Z',
        exerciseId: 'biceps_curl',
        sets: [{ weightLbs: 60, repCount: 8 }],
      }),
    ];
    const lookup = () => ({ muscleGroups: ['biceps'] });
    const result = getVolumeByMuscleGroup(sessions, lookup);
    expect(result.byMuscleGroup.biceps).toBe(500 + 480);
  });
});
