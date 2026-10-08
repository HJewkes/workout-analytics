/**
 * Coverage Tracking Tests
 */

import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';
import { computeCoverage, identifyCoverageGaps } from '@/vbt/coverage';
import type { LoadVelocityDataPoint } from '@/vbt/profile';
import { buildCoverageMap } from '@/analytics/coverage';
import type { SetSummary } from '@/analytics/coverage';

// =============================================================================
// Test Data
// =============================================================================

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** Even distribution across intensity spectrum. e1RM = 100. */
const EVEN_DATA: LoadVelocityDataPoint[] = [
  { load: 45, velocity: 0.9, timestamp: now }, // 45% e1RM
  { load: 55, velocity: 0.8, timestamp: now }, // 55%
  { load: 65, velocity: 0.7, timestamp: now }, // 65%
  { load: 75, velocity: 0.55, timestamp: now }, // 75%
  { load: 85, velocity: 0.4, timestamp: now }, // 85%
  { load: 95, velocity: 0.25, timestamp: now }, // 95%
];

/** Concentrated in one area */
const CONCENTRATED_DATA: LoadVelocityDataPoint[] = [
  { load: 70, velocity: 0.6, timestamp: now },
  { load: 72, velocity: 0.58, timestamp: now },
  { load: 74, velocity: 0.56, timestamp: now },
  { load: 76, velocity: 0.54, timestamp: now },
];

// =============================================================================
// computeCoverage
// =============================================================================

describe('computeCoverage', () => {
  it('creates correct number of bins', () => {
    const result = computeCoverage([], 100);
    // Default: 40-100, width 10 -> 6 bins: [40,50), [50,60), [60,70), [70,80), [80,90), [90,100)
    expect(result.bins).toHaveLength(6);
  });

  it('bins data correctly for even distribution', () => {
    const result = computeCoverage(EVEN_DATA, 100);
    // Each bin should have 1 data point
    for (const bin of result.bins) {
      expect(bin.count).toBe(1);
    }
    expect(result.coverageScore).toBe(1.0);
    expect(result.gaps).toHaveLength(0);
  });

  it('identifies gaps for concentrated data', () => {
    const result = computeCoverage(CONCENTRATED_DATA, 100);
    // All data is at 70-76% -> only [70,80) bin has data
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(result.coverageScore).toBeLessThan(0.5);
  });

  it('handles empty data', () => {
    const result = computeCoverage([], 100);
    expect(result.coverageScore).toBe(0);
    expect(result.gaps).toHaveLength(6); // All bins are gaps
  });

  it('handles zero e1RM', () => {
    const result = computeCoverage(EVEN_DATA, 0);
    expect(result.coverageScore).toBe(0);
  });

  it('supports custom bin width', () => {
    const result = computeCoverage(EVEN_DATA, 100, { binWidth: 20 });
    // [40,60), [60,80), [80,100) -> 3 bins
    expect(result.bins).toHaveLength(3);
  });

  it('supports custom bin range', () => {
    const result = computeCoverage(EVEN_DATA, 100, { binRange: [60, 100] });
    // [60,70), [70,80), [80,90), [90,100) -> 4 bins
    expect(result.bins).toHaveLength(4);
  });

  it('tracks last observed timestamp', () => {
    const result = computeCoverage(EVEN_DATA, 100);
    const coveredBins = result.bins.filter((b) => b.count > 0);
    for (const bin of coveredBins) {
      expect(bin.lastObservedAt).toBe(now);
    }
  });

  it('staleness filter excludes old data', () => {
    const oldData: LoadVelocityDataPoint[] = [
      { load: 65, velocity: 0.7, timestamp: now - 60 * DAY },
    ];
    const result = computeCoverage(oldData, 100, { stalenessMs: 30 * DAY });
    // The old data point should be excluded
    expect(result.coverageScore).toBe(0);
  });

  it.each([0, -10, NaN, Infinity, -Infinity])(
    'rejects a binWidth of %s instead of building bins',
    { timeout: 2000 },
    (binWidth) => {
      // Arrange
      const options = { binWidth };

      // Act
      const run = () => computeCoverage(EVEN_DATA, 100, options);

      // Assert
      expect(run).toThrow(RangeError);
    }
  );

  it('counts a set at exactly e1RM in the top bin', () => {
    // Arrange
    const single: LoadVelocityDataPoint[] = [{ load: 100, velocity: 0.15, timestamp: now }];

    // Act
    const result = computeCoverage(single, 100);

    // Assert
    expect(result.bins[result.bins.length - 1].count).toBe(1);
  });

  it('still drops a set above the top of the bin range', () => {
    // Arrange
    const overload: LoadVelocityDataPoint[] = [{ load: 105, velocity: 0.1, timestamp: now }];

    // Act
    const result = computeCoverage(overload, 100);

    // Assert
    expect(result.coverageScore).toBe(0);
  });

  it('agrees with buildCoverageMap that a set at exactly e1RM is in the top bin', () => {
    // Arrange
    const e1RM = 100;
    const single: LoadVelocityDataPoint[] = [{ load: e1RM, velocity: 0.15, timestamp: now }];
    const summary: SetSummary[] = [{ weightLbs: e1RM, startedAt: new Date(now).toISOString() }];

    // Act
    const vbtBins = computeCoverage(single, e1RM).bins;
    const mapBins = buildCoverageMap(summary, e1RM);

    // Assert
    expect(vbtBins[vbtBins.length - 1].count).toBe(1);
    expect(mapBins[mapBins.length - 1].pointCount).toBe(1);
  });

  it('builds exactly four bins for a 0.1 width over [0.6, 1]', () => {
    // Act
    const result = computeCoverage([], 100, { binWidth: 0.1, binRange: [0.6, 1] });

    // Assert
    expect(result.bins).toHaveLength(4);
    expect(result.bins[3].range[1]).toBe(1);
  });

  it('scores full coverage when every fractional-width bin has a point', () => {
    // Arrange
    const points: LoadVelocityDataPoint[] = [
      0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95,
    ].map((load) => ({ load, velocity: 0.5, timestamp: now }));

    // Act
    const result = computeCoverage(points, 100, { binWidth: 0.1, binRange: [0, 1] });

    // Assert
    expect(result.bins).toHaveLength(10);
    expect(result.coverageScore).toBe(1);
  });

  it('shares bin lower edges with buildCoverageMap for a fractional width', () => {
    // Act
    const vbtBins = computeCoverage([], 1, { binWidth: 0.1, binRange: [0.6, 1] }).bins;
    const mapBins = buildCoverageMap([], 1, { binCount: 4, binMinPctE1RM: 0.6, binMaxPctE1RM: 1 });

    // Assert
    expect(vbtBins.map((bin) => bin.range[0])).toEqual(mapBins.map((bin) => bin.binMinPctE1RM));
  });

  it.each([
    {
      binWidth: 10,
      binRange: [40, 100],
      expected: [
        [40, 50],
        [50, 60],
        [60, 70],
        [70, 80],
        [80, 90],
        [90, 100],
      ],
    },
    {
      binWidth: 25,
      binRange: [40, 100],
      expected: [
        [40, 65],
        [65, 90],
        [90, 100],
      ],
    },
    {
      binWidth: 0.25,
      binRange: [0, 1],
      expected: [
        [0, 0.25],
        [0.25, 0.5],
        [0.5, 0.75],
        [0.75, 1],
      ],
    },
  ] as const)(
    'keeps exact-width bins of $binWidth over $binRange',
    ({ binWidth, binRange, expected }) => {
      // Act
      const result = computeCoverage([], 100, { binWidth, binRange: [...binRange] });

      // Assert
      expect(result.bins.map((bin) => bin.range)).toEqual(expected);
    }
  );

  it.each([
    [NaN, 100],
    [40, NaN],
    [100, 40],
    [40, 40],
  ])('rejects a binRange of [%s, %s]', (rangeMin, rangeMax) => {
    // Act
    const run = () => computeCoverage(EVEN_DATA, 100, { binRange: [rangeMin, rangeMax] });

    // Assert
    expect(run).toThrow(RangeError);
  });

  it.each([
    ['40', 'Infinity'],
    ['-Infinity', '100'],
    ['-1e308', '1e308'],
  ])(
    'rejects a binRange of [%s, %s] without hanging',
    { timeout: 30_000 },
    (rangeMin, rangeMax) => {
      // Act
      const outcome = runCoverageInChild(rangeMin, rangeMax);

      // Assert
      expect(outcome).toBe('RangeError');
    }
  );
});

/**
 * Call computeCoverage in a child process with a small heap and a deadline,
 * so a bin loop that never ends fails this test instead of hanging the suite.
 */
function runCoverageInChild(rangeMin: string, rangeMax: string): string {
  const moduleUrl = new URL('./coverage.ts', import.meta.url).href;
  const script = `
    const { computeCoverage } = await import(${JSON.stringify(moduleUrl)});
    const binRange = [Number(${JSON.stringify(rangeMin)}), Number(${JSON.stringify(rangeMax)})];
    try {
      computeCoverage([], 100, { binRange });
      console.log('returned');
    } catch (error) {
      console.log(error.constructor.name);
    }`;
  const child = spawnSync(
    process.execPath,
    ['--max-old-space-size=128', '--import', 'tsx', '--input-type=module', '-e', script],
    { encoding: 'utf8', timeout: 15_000 }
  );
  return child.stdout.trim() || `no result (signal ${child.signal}, status ${child.status})`;
}

// =============================================================================
// identifyCoverageGaps
// =============================================================================

describe('identifyCoverageGaps', () => {
  it('returns all bins as gaps when no data', () => {
    const coverage = computeCoverage([], 100);
    const gaps = identifyCoverageGaps(coverage);
    expect(gaps).toHaveLength(6);
  });

  it('returns no gaps when fully covered', () => {
    const coverage = computeCoverage(EVEN_DATA, 100);
    const gaps = identifyCoverageGaps(coverage);
    expect(gaps).toHaveLength(0);
  });

  it('supports minObservations threshold', () => {
    const data: LoadVelocityDataPoint[] = [
      { load: 45, velocity: 0.9, timestamp: now },
      { load: 65, velocity: 0.7, timestamp: now },
      { load: 65, velocity: 0.68, timestamp: now },
      { load: 65, velocity: 0.72, timestamp: now },
    ];
    const coverage = computeCoverage(data, 100);

    // With minObservations = 3, only [60,70) has enough
    const gaps = identifyCoverageGaps(coverage, 3);
    expect(gaps.length).toBeGreaterThan(0);

    // The [60,70) bin should NOT be in gaps since it has 3 observations
    const sixtyBinGap = gaps.find((g) => g.range[0] === 60);
    expect(sixtyBinGap).toBeUndefined();
  });
});
