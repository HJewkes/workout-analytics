/**
 * StreamingDistribution Tests
 *
 * Tests for streaming statistics including numerical stability,
 * merge correctness, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  createDistribution,
  addSample,
  mergeDist,
  getMean,
  getVariance,
  getStdDev,
  getZScore,
  getCV,
  isOutlier,
  isWithinRange,
  buildDistribution,
  EMPTY_DISTRIBUTION,
} from './distribution';

// =============================================================================
// createDistribution() Tests
// =============================================================================

describe('createDistribution()', () => {
  it('creates empty distribution', () => {
    const dist = createDistribution();

    expect(dist.n).toBe(0);
    expect(dist.sum).toBe(0);
    expect(dist.m2).toBe(0);
    expect(dist.min).toBe(Infinity);
    expect(dist.max).toBe(-Infinity);
  });

  it('returns the same EMPTY_DISTRIBUTION constant', () => {
    const dist = createDistribution();
    expect(dist).toBe(EMPTY_DISTRIBUTION);
  });
});

// =============================================================================
// addSample() Tests
// =============================================================================

describe('addSample()', () => {
  it('adds first sample correctly', () => {
    const dist = addSample(createDistribution(), 10);

    expect(dist.n).toBe(1);
    expect(dist.sum).toBe(10);
    expect(dist.min).toBe(10);
    expect(dist.max).toBe(10);
    expect(getMean(dist)).toBe(10);
  });

  it('tracks min and max correctly', () => {
    let dist = createDistribution();
    dist = addSample(dist, 5);
    dist = addSample(dist, 15);
    dist = addSample(dist, 10);

    expect(dist.min).toBe(5);
    expect(dist.max).toBe(15);
  });

  it('computes correct mean for multiple samples', () => {
    let dist = createDistribution();
    dist = addSample(dist, 10);
    dist = addSample(dist, 20);
    dist = addSample(dist, 30);

    expect(getMean(dist)).toBe(20);
  });

  it('computes correct variance for known values', () => {
    // Values: 2, 4, 4, 4, 5, 5, 7, 9
    // Mean = 5
    // Sample variance (Bessel's) = Σ(xi - mean)² / (n-1)
    // = [9 + 1 + 1 + 1 + 0 + 0 + 4 + 16] / 7 = 32/7 ≈ 4.571
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    const dist = buildDistribution(values);

    expect(getMean(dist)).toBe(5);
    expect(getVariance(dist)).toBeCloseTo(32 / 7, 5);
    expect(getStdDev(dist)).toBeCloseTo(Math.sqrt(32 / 7), 5);
  });

  it('returns new distribution object (immutability)', () => {
    const dist1 = createDistribution();
    const dist2 = addSample(dist1, 10);

    expect(dist1).not.toBe(dist2);
    expect(dist1.n).toBe(0);
    expect(dist2.n).toBe(1);
  });

  it('handles negative values', () => {
    const dist = buildDistribution([-10, -5, 0, 5, 10]);

    expect(getMean(dist)).toBe(0);
    expect(dist.min).toBe(-10);
    expect(dist.max).toBe(10);
  });

  it('handles very small values', () => {
    const dist = buildDistribution([0.001, 0.002, 0.003]);

    expect(getMean(dist)).toBeCloseTo(0.002, 10);
  });
});

// =============================================================================
// mergeDist() Tests
// =============================================================================

describe('mergeDist()', () => {
  it('merging with empty distribution returns the other', () => {
    const dist = buildDistribution([10, 20, 30]);
    const empty = createDistribution();

    expect(mergeDist(dist, empty)).toBe(dist);
    expect(mergeDist(empty, dist)).toBe(dist);
  });

  it('merges two distributions with correct count', () => {
    const dist1 = buildDistribution([1, 2, 3]);
    const dist2 = buildDistribution([4, 5, 6]);
    const merged = mergeDist(dist1, dist2);

    expect(merged.n).toBe(6);
  });

  it('merges two distributions with correct sum', () => {
    const dist1 = buildDistribution([1, 2, 3]); // sum = 6
    const dist2 = buildDistribution([4, 5, 6]); // sum = 15
    const merged = mergeDist(dist1, dist2);

    expect(merged.sum).toBe(21);
    expect(getMean(merged)).toBe(3.5);
  });

  it('merges two distributions with correct variance', () => {
    const values1 = [1, 2, 3];
    const values2 = [4, 5, 6];
    const allValues = [...values1, ...values2];

    const dist1 = buildDistribution(values1);
    const dist2 = buildDistribution(values2);
    const merged = mergeDist(dist1, dist2);
    const fromScratch = buildDistribution(allValues);

    // Merged variance should match building from scratch
    expect(getVariance(merged)).toBeCloseTo(getVariance(fromScratch), 10);
    expect(getStdDev(merged)).toBeCloseTo(getStdDev(fromScratch), 10);
  });

  it('merges min and max correctly', () => {
    const dist1 = buildDistribution([5, 10, 15]);
    const dist2 = buildDistribution([1, 20]);
    const merged = mergeDist(dist1, dist2);

    expect(merged.min).toBe(1);
    expect(merged.max).toBe(20);
  });

  it('is commutative for mean', () => {
    const dist1 = buildDistribution([1, 2, 3]);
    const dist2 = buildDistribution([7, 8, 9]);

    const merged1 = mergeDist(dist1, dist2);
    const merged2 = mergeDist(dist2, dist1);

    expect(getMean(merged1)).toBeCloseTo(getMean(merged2), 10);
  });
});

// =============================================================================
// Edge Cases Tests
// =============================================================================

describe('Edge cases', () => {
  describe('n === 0', () => {
    it('getMean returns 0', () => {
      expect(getMean(createDistribution())).toBe(0);
    });

    it('getVariance returns 0', () => {
      expect(getVariance(createDistribution())).toBe(0);
    });

    it('getStdDev returns 0', () => {
      expect(getStdDev(createDistribution())).toBe(0);
    });

    it('getZScore returns 0', () => {
      expect(getZScore(createDistribution(), 10)).toBe(0);
    });

    it('getCV returns 0', () => {
      expect(getCV(createDistribution())).toBe(0);
    });
  });

  describe('n === 1', () => {
    it('getVariance returns 0 (no spread)', () => {
      const dist = addSample(createDistribution(), 10);
      expect(getVariance(dist)).toBe(0);
    });

    it('getStdDev returns 0', () => {
      const dist = addSample(createDistribution(), 10);
      expect(getStdDev(dist)).toBe(0);
    });

    it('getZScore returns 0 (no variance)', () => {
      const dist = addSample(createDistribution(), 10);
      expect(getZScore(dist, 15)).toBe(0);
    });
  });

  describe('all same values', () => {
    it('has zero variance', () => {
      const dist = buildDistribution([5, 5, 5, 5, 5]);
      expect(getVariance(dist)).toBe(0);
    });

    it('getZScore returns 0', () => {
      const dist = buildDistribution([5, 5, 5, 5, 5]);
      expect(getZScore(dist, 10)).toBe(0);
    });
  });

  describe('mean of zero', () => {
    it('getCV returns 0', () => {
      const dist = buildDistribution([-1, 0, 1]);
      expect(getCV(dist)).toBe(0);
    });
  });
});

// =============================================================================
// getZScore() Tests
// =============================================================================

describe('getZScore()', () => {
  it('returns 0 for value equal to mean', () => {
    const dist = buildDistribution([10, 20, 30]);
    expect(getZScore(dist, 20)).toBeCloseTo(0, 10);
  });

  it('returns positive z-score for value above mean', () => {
    const dist = buildDistribution([10, 20, 30]);
    expect(getZScore(dist, 30)).toBeGreaterThan(0);
  });

  it('returns negative z-score for value below mean', () => {
    const dist = buildDistribution([10, 20, 30]);
    expect(getZScore(dist, 10)).toBeLessThan(0);
  });

  it('computes correct z-score for known distribution', () => {
    // Standard normal approximation: values with mean=0, stdDev=1
    const dist = buildDistribution([-2, -1, 0, 1, 2]);
    const stdDev = getStdDev(dist);
    const mean = getMean(dist);

    // Value 2 standard deviations above mean
    const zScore = getZScore(dist, mean + 2 * stdDev);
    expect(zScore).toBeCloseTo(2, 5);
  });
});

// =============================================================================
// isOutlier() and isWithinRange() Tests
// =============================================================================

describe('isOutlier()', () => {
  it('returns false for value at mean', () => {
    const dist = buildDistribution([10, 20, 30]);
    expect(isOutlier(dist, 20)).toBe(false);
  });

  it('returns true for extreme value with default threshold', () => {
    const dist = buildDistribution([10, 10, 10, 10, 10, 10, 10, 10, 10, 100]);
    expect(isOutlier(dist, 100)).toBe(true);
  });

  it('respects custom threshold', () => {
    const dist = buildDistribution([1, 2, 3, 4, 5]);
    const mean = getMean(dist);
    const stdDev = getStdDev(dist);

    // Value exactly 1 stdDev away
    const value = mean + stdDev;
    expect(isOutlier(dist, value, 0.5)).toBe(true); // Strict threshold
    expect(isOutlier(dist, value, 2.0)).toBe(false); // Lenient threshold
  });
});

describe('isWithinRange()', () => {
  it('returns true for value at mean', () => {
    const dist = buildDistribution([10, 20, 30]);
    expect(isWithinRange(dist, 20)).toBe(true);
  });

  it('returns opposite of isOutlier for same threshold', () => {
    const dist = buildDistribution([10, 20, 30]);
    const value = 35;
    const threshold = 2.0;

    expect(isWithinRange(dist, value, threshold)).toBe(!isOutlier(dist, value, threshold));
  });
});

// =============================================================================
// getCV() Tests
// =============================================================================

describe('getCV()', () => {
  it('computes coefficient of variation correctly', () => {
    // CV = stdDev / |mean|
    const dist = buildDistribution([90, 100, 110]);
    const cv = getCV(dist);

    expect(cv).toBeCloseTo(getStdDev(dist) / getMean(dist), 10);
  });

  it('handles distributions with negative mean', () => {
    const dist = buildDistribution([-110, -100, -90]);
    const cv = getCV(dist);

    // CV uses absolute value of mean
    expect(cv).toBeGreaterThan(0);
    expect(cv).toBeCloseTo(getStdDev(dist) / 100, 5);
  });
});

// =============================================================================
// Numerical Stability Tests
// =============================================================================

describe('Numerical stability', () => {
  it('handles large number of samples without overflow', () => {
    let dist = createDistribution();
    for (let i = 0; i < 10000; i++) {
      dist = addSample(dist, Math.random() * 100);
    }

    expect(dist.n).toBe(10000);
    expect(isFinite(getMean(dist))).toBe(true);
    expect(isFinite(getVariance(dist))).toBe(true);
    expect(getVariance(dist)).toBeGreaterThan(0);
  });

  it('handles large values without precision loss', () => {
    const largeValue = 1e10;
    const dist = buildDistribution([largeValue, largeValue + 1, largeValue + 2]);

    expect(getMean(dist)).toBeCloseTo(largeValue + 1, 0);
    expect(getVariance(dist)).toBeCloseTo(1, 5);
  });

  it('Welford avoids catastrophic cancellation', () => {
    // This is a classic case where naive variance calculation fails
    // Values very close together with large offset
    const offset = 1e9;
    const values = [offset + 1, offset + 2, offset + 3];
    const dist = buildDistribution(values);

    // Variance should be 1, not some tiny or negative number
    expect(getVariance(dist)).toBeCloseTo(1, 5);
  });

  it('merge maintains numerical stability', () => {
    // Create two distributions with large values
    const offset = 1e9;
    const dist1 = buildDistribution([offset + 1, offset + 2]);
    const dist2 = buildDistribution([offset + 3, offset + 4]);
    const merged = mergeDist(dist1, dist2);

    const fromScratch = buildDistribution([offset + 1, offset + 2, offset + 3, offset + 4]);

    expect(getMean(merged)).toBeCloseTo(getMean(fromScratch), 0);
    expect(getVariance(merged)).toBeCloseTo(getVariance(fromScratch), 5);
  });
});

// =============================================================================
// buildDistribution() Tests
// =============================================================================

describe('buildDistribution()', () => {
  it('builds from empty array', () => {
    const dist = buildDistribution([]);
    expect(dist.n).toBe(0);
  });

  it('builds from single value', () => {
    const dist = buildDistribution([42]);
    expect(dist.n).toBe(1);
    expect(getMean(dist)).toBe(42);
  });

  it('builds from array of values', () => {
    const values = [1, 2, 3, 4, 5];
    const dist = buildDistribution(values);

    expect(dist.n).toBe(5);
    expect(getMean(dist)).toBe(3);
  });
});
