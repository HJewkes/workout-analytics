/**
 * Coverage Tracking Tests
 */

import { describe, it, expect } from 'vitest';
import { computeCoverage, identifyCoverageGaps } from '@/vbt/coverage';
import type { LoadVelocityDataPoint } from '@/vbt/profile';

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
});

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
