/**
 * Advanced LV Profile Fitting Tests
 */

import { describe, it, expect } from 'vitest';
import { fitLVProfile } from '@/vbt/profile-fitting';
import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Test Data
// =============================================================================

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

/** Perfect linear: velocity = -0.01 * load + 1.5 */
const PERFECT_LINEAR: LoadVelocityDataPoint[] = [
  { load: 20, velocity: 1.30, timestamp: now },
  { load: 40, velocity: 1.10, timestamp: now },
  { load: 60, velocity: 0.90, timestamp: now },
  { load: 80, velocity: 0.70, timestamp: now },
  { load: 100, velocity: 0.50, timestamp: now },
];

/** Data with one extreme outlier */
const WITH_OUTLIER: LoadVelocityDataPoint[] = [
  { load: 20, velocity: 1.30, timestamp: now },
  { load: 40, velocity: 1.10, timestamp: now },
  { load: 60, velocity: 0.90, timestamp: now },
  { load: 80, velocity: 0.70, timestamp: now },
  { load: 100, velocity: 0.50, timestamp: now },
  { load: 50, velocity: -0.50, timestamp: now }, // Extreme outlier
];

/** Data with recency variation - recent data shows strength improvement */
const RECENCY_DATA: LoadVelocityDataPoint[] = [
  { load: 40, velocity: 0.90, timestamp: now - 90 * DAY },
  { load: 60, velocity: 0.65, timestamp: now - 90 * DAY },
  { load: 80, velocity: 0.40, timestamp: now - 90 * DAY },
  { load: 40, velocity: 1.00, timestamp: now },
  { load: 60, velocity: 0.75, timestamp: now },
  { load: 80, velocity: 0.50, timestamp: now },
];

// =============================================================================
// fitLVProfile - Basic
// =============================================================================

describe('fitLVProfile', () => {
  it('handles empty data', () => {
    const result = fitLVProfile([]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(0);
    expect(result.rSquared).toBe(0);
    expect(result.dataPointsUsed).toBe(0);
  });

  it('fits perfect linear data correctly', () => {
    const result = fitLVProfile(PERFECT_LINEAR);
    expect(result.slope).toBeCloseTo(-0.01, 4);
    expect(result.intercept).toBeCloseTo(1.50, 4);
    expect(result.rSquared).toBeCloseTo(1.0, 4);
    expect(result.dataPointsUsed).toBe(5);
  });

  it('provides finite uncertainty for 3+ points', () => {
    const result = fitLVProfile(PERFECT_LINEAR);
    expect(result.uncertainty.slope).toBeLessThan(Infinity);
    expect(result.uncertainty.intercept).toBeLessThan(Infinity);
  });

  it('provides infinite uncertainty for fewer than 3 points', () => {
    const result = fitLVProfile(PERFECT_LINEAR.slice(0, 2));
    expect(result.uncertainty.slope).toBe(Infinity);
  });
});

// =============================================================================
// Recency Weighting
// =============================================================================

describe('fitLVProfile with recency weighting', () => {
  it('weights recent data more heavily', () => {
    // Without recency: all points equal weight
    const noRecency = fitLVProfile(RECENCY_DATA);

    // With recency: recent (faster) points weighted more
    const withRecency = fitLVProfile(RECENCY_DATA, {
      weightByRecency: true,
      recencyHalfLife: 30 * DAY,
    });

    // Recent data is faster at every load -> recency-weighted intercept higher
    // (predicted velocity at any load is higher when recent data dominates)
    // Check that predicted velocity at load=60 is higher with recency
    const predNoRecency = noRecency.slope * 60 + noRecency.intercept;
    const predWithRecency = withRecency.slope * 60 + withRecency.intercept;
    expect(predWithRecency).toBeGreaterThan(predNoRecency);
  });
});

// =============================================================================
// Quality Weighting
// =============================================================================

describe('fitLVProfile with quality weighting', () => {
  it('applies quality weights', () => {
    const data: LoadVelocityDataPoint[] = [
      { load: 40, velocity: 1.10 },
      { load: 60, velocity: 0.90 },
      { load: 80, velocity: 0.70 },
    ];
    const qualityWeights = [0.1, 1.0, 1.0]; // First point low quality

    const result = fitLVProfile(data, {
      weightByQuality: true,
      qualityWeights,
    });

    expect(result.dataPointsUsed).toBe(3);
    expect(result.rSquared).toBeGreaterThan(0);
  });
});

// =============================================================================
// Robust Regression
// =============================================================================

describe('fitLVProfile with robust regression', () => {
  it('resists outliers better than OLS', () => {
    const ols = fitLVProfile(WITH_OUTLIER);
    const robust = fitLVProfile(WITH_OUTLIER, { robustRegression: true });

    // Robust should be closer to the true line (-0.01, 1.50) than OLS
    const olsSlopeError = Math.abs(ols.slope - (-0.01));
    const robustSlopeError = Math.abs(robust.slope - (-0.01));
    expect(robustSlopeError).toBeLessThan(olsSlopeError);
  });

  it('produces similar results to OLS when no outliers', () => {
    const ols = fitLVProfile(PERFECT_LINEAR);
    const robust = fitLVProfile(PERFECT_LINEAR, { robustRegression: true });

    expect(robust.slope).toBeCloseTo(ols.slope, 4);
    expect(robust.intercept).toBeCloseTo(ols.intercept, 4);
  });
});

// =============================================================================
// Max Age Filter
// =============================================================================

describe('fitLVProfile with maxAge', () => {
  it('excludes old data points', () => {
    const data: LoadVelocityDataPoint[] = [
      { load: 60, velocity: 0.80, timestamp: now - 100 * DAY }, // Old
      { load: 60, velocity: 0.90, timestamp: now }, // Recent
    ];

    const result = fitLVProfile(data, { maxAge: 30 * DAY });
    expect(result.dataPointsUsed).toBe(1);
  });

  it('includes points without timestamps', () => {
    const data: LoadVelocityDataPoint[] = [
      { load: 60, velocity: 0.80 }, // No timestamp -> always included
      { load: 80, velocity: 0.60, timestamp: now },
    ];

    const result = fitLVProfile(data, { maxAge: 30 * DAY });
    expect(result.dataPointsUsed).toBe(2);
  });

  it('returns empty result when all points are too old', () => {
    const data: LoadVelocityDataPoint[] = [
      { load: 60, velocity: 0.80, timestamp: now - 100 * DAY },
      { load: 80, velocity: 0.60, timestamp: now - 90 * DAY },
    ];

    const result = fitLVProfile(data, { maxAge: 30 * DAY });
    expect(result.dataPointsUsed).toBe(0);
    expect(result.slope).toBe(0);
  });
});
