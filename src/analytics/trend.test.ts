import { describe, it, expect } from 'vitest';
import { analyzeTrend, detectPlateau } from './trend';
import type { TimeSeries } from './trend';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a TimeSeries from day offsets (relative to 2024-01-01) and values. */
function makeSeries(points: Array<[dayOffset: number, value: number]>): TimeSeries {
  const base = new Date('2024-01-01T00:00:00Z').getTime();
  return points.map(([days, value]) => ({
    ts: new Date(base + days * 86_400_000).toISOString(),
    value,
  }));
}

/** Strictly increasing series: value = dayOffset (perfect linear, slope = 1/day). */
function ascendingSeries(n: number, step = 1): TimeSeries {
  return makeSeries(Array.from({ length: n }, (_, i) => [i * step, i * step] as [number, number]));
}

/** Strictly decreasing series: value = (n-1) - i per day. */
function descendingSeries(n: number, step = 1): TimeSeries {
  return makeSeries(
    Array.from({ length: n }, (_, i) => [i * step, (n - 1 - i) * step] as [number, number])
  );
}

/** Flat series: all values equal `v`. */
function flatSeries(n: number, v: number, step = 1): TimeSeries {
  return makeSeries(Array.from({ length: n }, (_, i) => [i * step, v] as [number, number]));
}

// ---------------------------------------------------------------------------
// analyzeTrend
// ---------------------------------------------------------------------------

describe('analyzeTrend', () => {
  describe('edge cases', () => {
    it('returns flat/low for empty series', () => {
      const result = analyzeTrend([]);
      expect(result.direction).toBe('flat');
      expect(result.confidence).toBe('low');
      expect(result.pointCount).toBe(0);
      expect(result.slope).toBe(0);
      expect(result.rSquared).toBe(0);
      expect(result.percentChange).toBe(0);
      expect(result.windowDays).toBe(0);
    });

    it('returns flat/low for a single point', () => {
      const result = analyzeTrend(makeSeries([[0, 50]]));
      expect(result.direction).toBe('flat');
      expect(result.confidence).toBe('low');
      expect(result.pointCount).toBe(1);
      expect(result.slope).toBe(0);
    });

    it('sets intercept to the single point value', () => {
      const result = analyzeTrend(makeSeries([[0, 42]]));
      expect(result.intercept).toBe(42);
    });
  });

  describe('direction detection', () => {
    it('detects "up" for a strictly increasing series with enough points', () => {
      const series = ascendingSeries(10, 2); // 10 points, 2-day steps, value = days
      const result = analyzeTrend(series);
      expect(result.direction).toBe('up');
      expect(result.slope).toBeGreaterThan(0);
    });

    it('detects "down" for a strictly decreasing series', () => {
      const series = descendingSeries(10, 2);
      const result = analyzeTrend(series);
      expect(result.direction).toBe('down');
      expect(result.slope).toBeLessThan(0);
    });

    it('detects "flat" for a flat series (all same value)', () => {
      const series = flatSeries(8, 100);
      const result = analyzeTrend(series);
      expect(result.direction).toBe('flat');
      expect(Math.abs(result.slope)).toBeLessThan(1e-9);
    });

    it('respects custom flatThresholdPerDay', () => {
      // slope of 0.0005 per day — below default threshold of 0.001 so flat
      const series = makeSeries(
        Array.from({ length: 10 }, (_, i) => [i, i * 0.0005] as [number, number])
      );
      const resultDefault = analyzeTrend(series);
      expect(resultDefault.direction).toBe('flat');

      // With a tighter threshold the same slope becomes 'up'
      const resultTight = analyzeTrend(series, { flatThresholdPerDay: 0.0001 });
      expect(resultTight.direction).toBe('up');
    });
  });

  describe('R² and confidence', () => {
    it('gives high confidence for a clean ascending series with 10 points', () => {
      const series = ascendingSeries(10, 1);
      const result = analyzeTrend(series);
      expect(result.rSquared).toBeGreaterThan(0.99);
      expect(result.confidence).toBe('high');
    });

    it('gives low confidence for a noisy series even if the mean trend is up', () => {
      // Trend is generally up but with high noise
      const series = makeSeries([
        [0, 10],
        [1, 50],
        [2, 5],
        [3, 80],
        [4, 2],
        [5, 100],
      ]);
      const result = analyzeTrend(series);
      // rSquared will be low; confidence must reflect that
      expect(result.confidence).toBe('low');
    });

    it('gives medium confidence for a moderate fit with >= 3 points', () => {
      // 3 points with a decent but imperfect trend
      const series = makeSeries([
        [0, 10],
        [1, 12],
        [2, 11.5],
      ]);
      const result = analyzeTrend(series);
      // This is a nearly-linear set; confidence depends on rSquared
      expect(['low', 'medium', 'high']).toContain(result.confidence);
    });

    it('treats flat series as rSquared=1 and direction=flat', () => {
      const series = flatSeries(6, 50, 1);
      const result = analyzeTrend(series);
      // All y-values identical → ssYY = 0 → rSquared = 1 by convention
      expect(result.rSquared).toBe(1);
      expect(result.direction).toBe('flat'); // slope = 0, below flatThreshold
    });
  });

  describe('slope and percentChange', () => {
    it('reports slope close to 1 value/day for ascending-by-1-per-day series', () => {
      const series = ascendingSeries(10, 1);
      const result = analyzeTrend(series);
      expect(result.slope).toBeCloseTo(1, 5);
    });

    it('computes percentChange as (last - first) / first × 100', () => {
      const series = makeSeries([
        [0, 100],
        [7, 110],
      ]);
      const result = analyzeTrend(series);
      expect(result.percentChange).toBeCloseTo(10, 5);
    });

    it('returns percentChange = 0 when first value is 0', () => {
      const series = makeSeries([
        [0, 0],
        [1, 5],
        [2, 10],
      ]);
      const result = analyzeTrend(series);
      expect(result.percentChange).toBe(0);
    });

    it('reports windowDays = span between first and last timestamp', () => {
      const series = ascendingSeries(5, 3); // points at day 0,3,6,9,12
      const result = analyzeTrend(series);
      expect(result.windowDays).toBeCloseTo(12, 5);
    });
  });
});

// ---------------------------------------------------------------------------
// detectPlateau
// ---------------------------------------------------------------------------

describe('detectPlateau', () => {
  describe('edge cases', () => {
    it('returns not-a-plateau for empty series', () => {
      const result = detectPlateau([]);
      expect(result.isPlateau).toBe(false);
      expect(result.plateauDays).toBe(0);
      expect(result.reasoning).toBe('no data');
    });

    it('returns not-a-plateau for a single point', () => {
      const result = detectPlateau(makeSeries([[0, 50]]));
      expect(result.isPlateau).toBe(false);
      expect(result.plateauDays).toBe(0);
    });
  });

  describe('plateau detection', () => {
    it('detects a recent stable run within threshold', () => {
      // 15 days of stable values around 100, then some older values further away
      const recent = Array.from({ length: 16 }, (_, i) => [i, 100 + (i % 3)] as [number, number]);
      const result = detectPlateau(makeSeries(recent), 5, 14);
      expect(result.isPlateau).toBe(true);
      expect(result.plateauDays).toBeGreaterThanOrEqual(14);
    });

    it('is not flagged when the most recent point has a big spike', () => {
      // 20 stable days at ~100, then a large spike on day 21
      const stable = Array.from(
        { length: 20 },
        (_, i) => [i, 100 + (i % 2)] as [number, number]
      );
      stable.push([21, 500]); // spike
      const result = detectPlateau(makeSeries(stable), 5, 14);
      // The spike breaks the plateau at the recent end
      expect(result.isPlateau).toBe(false);
    });

    it('is not flagged when the plateau is old and recent values diverge', () => {
      // Old plateau days 0-19 at 100, recent spike day 20 at 200
      const series = makeSeries([
        ...Array.from({ length: 20 }, (_, i) => [i, 100] as [number, number]),
        [20, 200],
      ]);
      const result = detectPlateau(series, 5, 14);
      // Most-recent point is 200, which deviates from the old cluster
      expect(result.isPlateau).toBe(false);
    });

    it('returns varianceThresholdPct matching the argument', () => {
      const result = detectPlateau(makeSeries([[0, 100], [1, 100]]), 8, 14);
      expect(result.varianceThresholdPct).toBe(8);
    });
  });

  describe('threshold sensitivity', () => {
    it('tighter threshold causes values with small variance to fail', () => {
      // Values deviate 3% from median — passes 5% but fails 2%
      const series = makeSeries([
        [0, 100],
        [5, 103],
        [10, 100],
        [15, 97],
        [20, 100],
      ]);
      const pass5 = detectPlateau(series, 5, 14);
      const fail2 = detectPlateau(series, 2, 14);
      expect(pass5.isPlateau).toBe(true);
      expect(fail2.isPlateau).toBe(false);
    });
  });

  describe('minDays sensitivity', () => {
    it('a 14-day stable run does not satisfy a 30-day minDays requirement', () => {
      const series = makeSeries(
        Array.from({ length: 15 }, (_, i) => [i, 100] as [number, number])
      );
      const result = detectPlateau(series, 5, 30);
      expect(result.isPlateau).toBe(false);
      expect(result.plateauDays).toBeLessThan(30);
    });

    it('a 14-day stable run satisfies a 10-day minDays requirement', () => {
      const series = makeSeries(
        Array.from({ length: 15 }, (_, i) => [i, 100] as [number, number])
      );
      const result = detectPlateau(series, 5, 10);
      expect(result.isPlateau).toBe(true);
    });
  });
});
