/**
 * Time Series - Cross-session aggregation primitives.
 *
 * Build TimeSeries over per-session metrics, bucketed by session, day, or
 * ISO week. Aggregate weekly summaries and volume by muscle group.
 *
 * Operates on `ProcessedSession` records — minimal session-summary inputs
 * that the storage layer (or any caller) prepares from raw rep/sample data.
 * This file deliberately does NOT depend on the sample-based `Set` model;
 * those primitives belong in set-analytics / session.ts.
 *
 * NOTE: `TimeSeries` / `TimeSeriesPoint` will eventually move to
 * `src/analytics/trend.ts` (parallel branch from VLT-02 T23). They are
 * defined here inline until that branch lands; the trend module can re-
 * export from here to avoid a breaking change.
 */

// =============================================================================
// TimeSeries Types (inline — to be re-exported from trend.ts when T23 lands)
// =============================================================================

/**
 * A single point in a time series.
 */
export interface TimeSeriesPoint<T = number> {
  /** ISO timestamp of the bucket (start of bucket for day/week, session start for session). */
  timestamp: string;
  /** Aggregated value for this bucket. */
  value: T;
  /** Optional metadata: session ids, sample count, etc. */
  metadata?: Record<string, unknown>;
}

/**
 * Ordered series of metric values over time.
 */
export interface TimeSeries<T = number> {
  metric: MetricKey;
  bucketBy: 'session' | 'day' | 'week';
  exerciseId?: string;
  points: ReadonlyArray<TimeSeriesPoint<T>>;
}

// =============================================================================
// Public Types
// =============================================================================

/**
 * Metric extracted per-session for the time series.
 *
 * - `velocity_mean`: mean of all sets' mean concentric velocity
 * - `velocity_loss`: mean of all sets' velocity loss percent
 * - `estimated_1rm`: max e1RM observed in the session
 * - `volume`: sum of weight × reps across all sets
 * - `top_weight`: max weight lifted in the session
 */
export type MetricKey =
  | 'velocity_mean'
  | 'velocity_loss'
  | 'estimated_1rm'
  | 'volume'
  | 'top_weight';

/**
 * Configuration for `buildTimeSeries`.
 */
export interface BuildTimeSeriesConfig {
  metric: MetricKey;
  /** How sessions are grouped into points. Default 'session'. */
  bucketBy?: 'session' | 'day' | 'week';
  /** If set, only sessions whose `exerciseId` matches are included. */
  exerciseId?: string;
  /** ISO lower bound (inclusive). Default no lower bound. */
  fromTs?: string;
  /** ISO upper bound (inclusive). Default no upper bound. */
  toTs?: string;
}

/**
 * Per-week summary returned by `getWeeklySummaries`.
 */
export interface WeeklySummary {
  /** ISO date (YYYY-MM-DD) of the Monday anchoring the ISO week. */
  weekStart: string;
  sessionCount: number;
  totalVolumeLbs: number;
  topWeightLbs: number | null;
  /** Distinct exercise ids trained that week, sorted ascending. */
  exerciseIds: string[];
}

/**
 * Volume-by-muscle-group result returned by `getVolumeByMuscleGroup`.
 *
 * Sessions whose exerciseId returns `undefined` from the lookup are
 * silently skipped (not attributed). Their volume IS still counted in
 * `totalVolumeLbs` if and only if they fall in the period, so callers can
 * detect gaps via `totalVolumeLbs - sum(byMuscleGroup values)`.
 */
export interface VolumeByMuscleGroup {
  period: { from: string; to: string };
  /** muscleGroupId -> total volume in lbs (sets x reps x weight). */
  byMuscleGroup: Record<string, number>;
  /** Total volume across ALL sessions in period (incl. unmapped exercises). */
  totalVolumeLbs: number;
}

/**
 * Minimal session-summary input.
 *
 * The canonical sample-based `Set` lives at `@/models/set` and is the right
 * input for set-level analytics (rep-by-rep velocity, fatigue within a set,
 * etc.). For cross-session aggregation the caller has already collapsed
 * those samples to per-set summary numbers (typical when reading from the
 * storage layer). This interface is the contract for that aggregated form.
 */
export interface ProcessedSession {
  id: string;
  /** ISO timestamp the session started. */
  startedAt: string;
  /** Optional exercise id; required for `exerciseId` filtering and muscle attribution. */
  exerciseId?: string;
  sets: ReadonlyArray<ProcessedSet>;
}

export interface ProcessedSet {
  weightLbs: number;
  repCount: number;
  velocityMean?: number;
  velocityLoss?: number;
  estimated1rm?: number;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Filter sessions by optional exerciseId + ISO date window.
 */
function filterSessions(
  sessions: ReadonlyArray<ProcessedSession>,
  filter: { exerciseId?: string; fromTs?: string; toTs?: string }
): ProcessedSession[] {
  return sessions.filter((s) => {
    if (filter.exerciseId !== undefined && s.exerciseId !== filter.exerciseId) {
      return false;
    }
    if (filter.fromTs !== undefined && s.startedAt < filter.fromTs) {
      return false;
    }
    if (filter.toTs !== undefined && s.startedAt > filter.toTs) {
      return false;
    }
    return true;
  });
}

/**
 * Extract a per-session scalar for a given metric.
 *
 * Returns `null` when the session has no contributing data — these
 * sessions are dropped from the time series entirely.
 */
function extractMetric(session: ProcessedSession, metric: MetricKey): number | null {
  if (session.sets.length === 0) return null;

  switch (metric) {
    case 'velocity_mean':
      return meanOfDefined(session.sets.map((s) => s.velocityMean));
    case 'velocity_loss':
      return meanOfDefined(session.sets.map((s) => s.velocityLoss));
    case 'estimated_1rm':
      return maxOfDefined(session.sets.map((s) => s.estimated1rm));
    case 'volume':
      return session.sets.reduce((acc, s) => acc + s.weightLbs * s.repCount, 0);
    case 'top_weight':
      return Math.max(...session.sets.map((s) => s.weightLbs));
  }
}

function meanOfDefined(xs: ReadonlyArray<number | undefined>): number | null {
  const defined = xs.filter((x): x is number => typeof x === 'number');
  if (defined.length === 0) return null;
  return defined.reduce((a, b) => a + b, 0) / defined.length;
}

function maxOfDefined(xs: ReadonlyArray<number | undefined>): number | null {
  const defined = xs.filter((x): x is number => typeof x === 'number');
  if (defined.length === 0) return null;
  return Math.max(...defined);
}

/**
 * Combine values within a bucket. velocity_* averages, volume sums,
 * estimated_1rm + top_weight take the max.
 */
function combineBucket(metric: MetricKey, values: ReadonlyArray<number>): number {
  switch (metric) {
    case 'velocity_mean':
    case 'velocity_loss':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'volume':
      return values.reduce((a, b) => a + b, 0);
    case 'estimated_1rm':
    case 'top_weight':
      return Math.max(...values);
  }
}

/**
 * ISO date string (YYYY-MM-DD) for the Monday of the ISO week containing `iso`.
 */
function isoWeekStart(iso: string): string {
  const d = new Date(iso);
  // getUTCDay: Sun=0, Mon=1, ..., Sat=6. We want Monday-anchored.
  const dayOfWeek = d.getUTCDay();
  const offsetToMonday = (dayOfWeek + 6) % 7; // Mon->0, Tue->1, ..., Sun->6
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offsetToMonday)
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * ISO date string (YYYY-MM-DD) for the day containing `iso`.
 */
function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

function bucketKey(iso: string, bucketBy: 'session' | 'day' | 'week', sessionId: string): string {
  switch (bucketBy) {
    case 'session':
      return sessionId;
    case 'day':
      return isoDay(iso);
    case 'week':
      return isoWeekStart(iso);
  }
}

function bucketTimestamp(iso: string, bucketBy: 'session' | 'day' | 'week'): string {
  switch (bucketBy) {
    case 'session':
      return iso;
    case 'day':
      return `${isoDay(iso)}T00:00:00.000Z`;
    case 'week':
      return `${isoWeekStart(iso)}T00:00:00.000Z`;
  }
}

// =============================================================================
// buildTimeSeries
// =============================================================================

/**
 * Build a TimeSeries over a metric, optionally bucketed by day/week.
 *
 * Sessions are filtered by `exerciseId` (if set) and the ISO window
 * `[fromTs, toTs]`. Within each bucket, values are combined per metric:
 * `velocity_*` average, `volume` sums, `estimated_1rm` and `top_weight`
 * take the max. Sessions with no contributing data are dropped.
 *
 * Output points are sorted ascending by timestamp.
 */
export function buildTimeSeries(
  sessions: ReadonlyArray<ProcessedSession>,
  config: BuildTimeSeriesConfig
): TimeSeries {
  const bucketBy = config.bucketBy ?? 'session';
  const filtered = filterSessions(sessions, {
    exerciseId: config.exerciseId,
    fromTs: config.fromTs,
    toTs: config.toTs,
  });

  // Group sessions by bucket key. For 'session' bucketBy this is a no-op
  // grouping (one session per bucket).
  const buckets = new Map<string, { timestamp: string; values: number[]; sessionIds: string[] }>();

  for (const session of filtered) {
    const value = extractMetric(session, config.metric);
    if (value === null) continue;

    const key = bucketKey(session.startedAt, bucketBy, session.id);
    const existing = buckets.get(key);
    if (existing) {
      existing.values.push(value);
      existing.sessionIds.push(session.id);
    } else {
      buckets.set(key, {
        timestamp: bucketTimestamp(session.startedAt, bucketBy),
        values: [value],
        sessionIds: [session.id],
      });
    }
  }

  const points: TimeSeriesPoint[] = Array.from(buckets.values())
    .map((b) => ({
      timestamp: b.timestamp,
      value: combineBucket(config.metric, b.values),
      metadata: { sessionIds: b.sessionIds, sampleCount: b.values.length },
    }))
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));

  return {
    metric: config.metric,
    bucketBy,
    exerciseId: config.exerciseId,
    points,
  };
}

// =============================================================================
// getWeeklySummaries
// =============================================================================

/**
 * Group sessions by ISO week (Monday-anchored). Returns the N most recent
 * weeks containing at least one session, sorted descending by `weekStart`.
 */
export function getWeeklySummaries(
  sessions: ReadonlyArray<ProcessedSession>,
  n: number = 12
): WeeklySummary[] {
  const byWeek = new Map<
    string,
    {
      sessionCount: number;
      totalVolumeLbs: number;
      topWeightLbs: number | null;
      exerciseIds: Set<string>;
    }
  >();

  for (const session of sessions) {
    const weekStart = isoWeekStart(session.startedAt);
    const bucket = byWeek.get(weekStart) ?? {
      sessionCount: 0,
      totalVolumeLbs: 0,
      topWeightLbs: null as number | null,
      exerciseIds: new Set<string>(),
    };

    bucket.sessionCount += 1;
    for (const set of session.sets) {
      bucket.totalVolumeLbs += set.weightLbs * set.repCount;
      if (bucket.topWeightLbs === null || set.weightLbs > bucket.topWeightLbs) {
        bucket.topWeightLbs = set.weightLbs;
      }
    }
    if (session.exerciseId !== undefined) {
      bucket.exerciseIds.add(session.exerciseId);
    }

    byWeek.set(weekStart, bucket);
  }

  return Array.from(byWeek.entries())
    .map(([weekStart, b]) => ({
      weekStart,
      sessionCount: b.sessionCount,
      totalVolumeLbs: b.totalVolumeLbs,
      topWeightLbs: b.topWeightLbs,
      exerciseIds: Array.from(b.exerciseIds).sort(),
    }))
    .sort((a, b) => (a.weekStart < b.weekStart ? 1 : a.weekStart > b.weekStart ? -1 : 0))
    .slice(0, n);
}

// =============================================================================
// getVolumeByMuscleGroup
// =============================================================================

/**
 * Sum volume across sessions in the period, attributed to muscle groups.
 *
 * Volume per set = `weightLbs × repCount`. For a session whose exercise has
 * multiple muscle groups, the volume is split evenly across them. Sessions
 * whose `exerciseId` is unknown to the lookup are skipped for attribution
 * but still count toward `totalVolumeLbs`, so callers can detect coverage
 * gaps.
 */
export function getVolumeByMuscleGroup(
  sessions: ReadonlyArray<ProcessedSession>,
  exerciseLookup: (id: string) => { muscleGroups: string[] } | undefined,
  period?: { from?: string; to?: string }
): VolumeByMuscleGroup {
  const filtered = filterSessions(sessions, {
    fromTs: period?.from,
    toTs: period?.to,
  });

  const byMuscleGroup: Record<string, number> = {};
  let totalVolumeLbs = 0;

  for (const session of filtered) {
    const sessionVolume = session.sets.reduce((acc, s) => acc + s.weightLbs * s.repCount, 0);
    totalVolumeLbs += sessionVolume;

    if (session.exerciseId === undefined) continue;
    const exercise = exerciseLookup(session.exerciseId);
    if (!exercise || exercise.muscleGroups.length === 0) continue;

    const sharePerGroup = sessionVolume / exercise.muscleGroups.length;
    for (const mg of exercise.muscleGroups) {
      byMuscleGroup[mg] = (byMuscleGroup[mg] ?? 0) + sharePerGroup;
    }
  }

  return {
    period: {
      from: period?.from ?? '',
      to: period?.to ?? '',
    },
    byMuscleGroup,
    totalVolumeLbs,
  };
}
