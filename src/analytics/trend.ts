/**
 * Trend Analytics - Linear trend detection and plateau detection for time series data.
 *
 * These pure functions assess direction and stability of cross-session metrics
 * (e.g. e1RM over time, session velocity, readiness scores). They operate on
 * generic (ts, value) time series and have no dependency on Set/Rep models.
 */

// =============================================================================
// Types
// =============================================================================

export interface TimeSeriesPoint {
  /** ISO 8601 timestamp */
  ts: string;
  value: number;
}

export type TimeSeries = TimeSeriesPoint[];

export interface TrendAnalysis {
  /** Categorical direction; 'flat' when slope is small or fit is poor */
  direction: 'up' | 'down' | 'flat';
  /** Slope in value-units per day */
  slope: number;
  /** Y-intercept of the linear fit (in value units, at day 0 = first point) */
  intercept: number;
  /** Coefficient of determination (0..1) */
  rSquared: number;
  /** (last - first) / first × 100; 0 when first === 0 */
  percentChange: number;
  pointCount: number;
  /** Span between first and last point in days */
  windowDays: number;
  /** Derived from rSquared + pointCount */
  confidence: 'low' | 'medium' | 'high';
}

export interface PlateauDetection {
  isPlateau: boolean;
  /** Length of the detected plateau in days */
  plateauDays: number;
  varianceThresholdPct: number;
  /** Human-readable explanation */
  reasoning: string;
}

// =============================================================================
// Helpers
// =============================================================================

/** Convert an ISO timestamp to a day-offset relative to a reference epoch. */
function toDays(ts: string): number {
  return new Date(ts).getTime() / 86_400_000;
}

/**
 * Ordinary least-squares linear regression on (x[], y[]) arrays.
 * Returns { slope, intercept, rSquared }. All zeros when n < 2 or x has no
 * variance (all identical timestamps).
 */
function ols(
  x: number[],
  y: number[]
): { slope: number; intercept: number; rSquared: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? y[0] : 0, rSquared: 0 };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumXX += x[i] * x[i];
    sumYY += y[i] * y[i];
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const ssXX = sumXX - n * meanX * meanX;
  const ssYY = sumYY - n * meanY * meanY;
  const ssXY = sumXY - n * meanX * meanY;

  if (ssXX === 0) {
    // All x values identical — vertical line, degenerate case
    return { slope: 0, intercept: meanY, rSquared: ssYY === 0 ? 1 : 0 };
  }

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  const ssRes = ssYY - slope * ssXY;
  // Guard against floating-point tiny negatives
  const rSquared = ssYY === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / ssYY));

  return { slope, intercept, rSquared };
}

// =============================================================================
// analyzeTrend
// =============================================================================

/**
 * Linear regression on the time series. Returns slope, fit quality,
 * and a categorical direction label.
 *
 * direction:
 *   - 'up'   if slope > flatThresholdPerDay AND rSquared > 0.3
 *   - 'down' if slope < -flatThresholdPerDay AND rSquared > 0.3
 *   - 'flat' otherwise
 *
 * confidence:
 *   - 'high'   if rSquared > 0.7 AND pointCount >= 5
 *   - 'medium' if rSquared > 0.4 AND pointCount >= 3
 *   - 'low'    otherwise
 */
export function analyzeTrend(
  series: TimeSeries,
  opts?: { flatThresholdPerDay?: number }
): TrendAnalysis {
  const flatThreshold = opts?.flatThresholdPerDay ?? 0.001;

  const empty: TrendAnalysis = {
    direction: 'flat',
    slope: 0,
    intercept: 0,
    rSquared: 0,
    percentChange: 0,
    pointCount: 0,
    windowDays: 0,
    confidence: 'low',
  };

  if (series.length === 0) return empty;
  if (series.length === 1) {
    return { ...empty, pointCount: 1, intercept: series[0].value };
  }

  const days = series.map((p) => toDays(p.ts));
  const values = series.map((p) => p.value);

  // Normalise x to days-since-first-point so intercept is interpretable
  const dayOffset = days[0];
  const x = days.map((d) => d - dayOffset);
  const y = values;

  const { slope, intercept, rSquared } = ols(x, y);

  const windowDays = x[x.length - 1];
  const first = values[0];
  const last = values[values.length - 1];
  const percentChange = first !== 0 ? ((last - first) / first) * 100 : 0;

  let direction: 'up' | 'down' | 'flat';
  if (rSquared > 0.3 && slope > flatThreshold) {
    direction = 'up';
  } else if (rSquared > 0.3 && slope < -flatThreshold) {
    direction = 'down';
  } else {
    direction = 'flat';
  }

  let confidence: 'low' | 'medium' | 'high';
  if (rSquared > 0.7 && series.length >= 5) {
    confidence = 'high';
  } else if (rSquared > 0.4 && series.length >= 3) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    direction,
    slope,
    intercept,
    rSquared,
    percentChange,
    pointCount: series.length,
    windowDays,
    confidence,
  };
}

// =============================================================================
// detectPlateau
// =============================================================================

/**
 * Detect a plateau: the longest contiguous run of points (scanning from the
 * most recent backward) where every value stays within `thresholdPct` of the
 * median of that run.
 *
 * Returns the longest qualifying stretch; isPlateau is true if it spans
 * >= minDays.
 *
 * Why median and not mean? The median is more resistant to the single spike
 * that would otherwise inflate the mean and shrink the measured deviation,
 * masking the plateau for the remaining points.
 */
export function detectPlateau(
  series: TimeSeries,
  thresholdPct: number = 5,
  minDays: number = 14
): PlateauDetection {
  const none = (reasoning: string): PlateauDetection => ({
    isPlateau: false,
    plateauDays: 0,
    varianceThresholdPct: thresholdPct,
    reasoning,
  });

  if (series.length === 0) return none('no data');
  if (series.length === 1) return none('only one data point');

  // Sort ascending by timestamp so indices are chronological
  const sorted = [...series].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  const days = sorted.map((p) => toDays(p.ts));
  const dayOffset = days[0];
  const relDays = days.map((d) => d - dayOffset);
  const values = sorted.map((p) => p.value);
  const n = sorted.length;

  /**
   * Compute the median of a subarray values[start..end] (inclusive).
   * Avoids mutating the original array.
   */
  function medianOf(start: number, end: number): number {
    const slice = values.slice(start, end + 1).sort((a, b) => a - b);
    const mid = Math.floor(slice.length / 2);
    return slice.length % 2 === 1 ? slice[mid] : (slice[mid - 1] + slice[mid]) / 2;
  }

  // Walk forward from the most recent point and find the longest qualifying run.
  // We try every possible start index from the most recent backward,
  // extending as far as the plateau holds.
  let bestStart = n - 1;
  let bestEnd = n - 1;

  // Outer loop: candidate start points (most recent first)
  for (let start = n - 1; start >= 0; start--) {
    // The run [start, n-1] — check if it qualifies
    const med = medianOf(start, n - 1);
    const threshold = Math.abs(med) * (thresholdPct / 100);

    let allWithin = true;
    for (let i = start; i < n; i++) {
      if (Math.abs(values[i] - med) > threshold) {
        allWithin = false;
        break;
      }
    }

    if (allWithin) {
      // This run [start, n-1] qualifies; it's longer than any prior candidate
      if (start < bestStart) {
        bestStart = start;
        bestEnd = n - 1;
      }
    } else {
      // Once the run from 'start' to 'end' fails we cannot make it longer by
      // going further back; but we can check if a shorter run is better.
      // The algorithm above already keeps the longest qualifying run anchored
      // at the recent end. Break now — further starts only produce sub-runs.
      break;
    }
  }

  const plateauDays = relDays[bestEnd] - relDays[bestStart];
  const isPlateau = plateauDays >= minDays;

  const reasoning = isPlateau
    ? `Values stayed within ${thresholdPct}% of median for ${plateauDays.toFixed(1)} days (${bestEnd - bestStart + 1} points)`
    : `Longest stable stretch is ${plateauDays.toFixed(1)} days — below ${minDays}-day threshold`;

  return {
    isPlateau,
    plateauDays,
    varianceThresholdPct: thresholdPct,
    reasoning,
  };
}
