/**
 * LV Profile Builder Tests
 */

import { describe, it, expect } from 'vitest';
import {
  buildProfile,
  predictVelocity,
  estimateLoad,
  addDataPoint,
  type LoadVelocityDataPoint,
} from '@/vbt/profile';
import { DEFAULT_MVT } from '@/vbt/constants';

// =============================================================================
// Test Data
// =============================================================================

/** Perfect linear data: velocity = -0.01 * load + 1.5 */
const PERFECT_LINEAR: LoadVelocityDataPoint[] = [
  { load: 20, velocity: 1.30 },
  { load: 40, velocity: 1.10 },
  { load: 60, velocity: 0.90 },
  { load: 80, velocity: 0.70 },
  { load: 100, velocity: 0.50 },
];

/** Realistic data with some noise */
const REALISTIC_DATA: LoadVelocityDataPoint[] = [
  { load: 30, velocity: 0.95 },
  { load: 45, velocity: 0.78 },
  { load: 60, velocity: 0.62 },
  { load: 75, velocity: 0.48 },
  { load: 90, velocity: 0.30 },
];

// =============================================================================
// buildProfile
// =============================================================================

describe('buildProfile', () => {
  it('computes correct slope and intercept for perfect linear data', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    expect(profile.slope).toBeCloseTo(-0.01, 4);
    expect(profile.intercept).toBeCloseTo(1.50, 4);
  });

  it('achieves R² = 1.0 for perfect linear data', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    expect(profile.rSquared).toBeCloseTo(1.0, 6);
  });

  it('achieves high R² for realistic data', () => {
    const profile = buildProfile(REALISTIC_DATA);
    expect(profile.rSquared).toBeGreaterThan(0.95);
  });

  it('estimates 1RM from the regression line', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    // velocity = -0.01 * load + 1.50
    // 0.17 = -0.01 * load + 1.50
    // load = (1.50 - 0.17) / 0.01 = 133
    expect(profile.estimated1RM).toBeCloseTo(133, 0);
  });

  it('uses provided MVT', () => {
    const profile = buildProfile(PERFECT_LINEAR, 0.20);
    // 0.20 = -0.01 * load + 1.50 -> load = 130
    expect(profile.estimated1RM).toBeCloseTo(130, 0);
    expect(profile.mvt).toBe(0.20);
  });

  it('uses DEFAULT_MVT when not specified', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    expect(profile.mvt).toBe(DEFAULT_MVT);
  });

  it('assigns high confidence for R² >= 0.90 and >= 3 points', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    expect(profile.confidence).toBe('high');
  });

  it('assigns medium confidence for R² >= 0.70 and >= 2 points', () => {
    // Two points always give R² = 1.0, but only 2 points
    const profile = buildProfile([
      { load: 50, velocity: 0.80 },
      { load: 80, velocity: 0.50 },
    ]);
    expect(profile.confidence).toBe('medium');
  });

  it('assigns low confidence for single point', () => {
    const profile = buildProfile([{ load: 50, velocity: 0.80 }]);
    expect(profile.confidence).toBe('low');
  });

  it('handles empty data', () => {
    const profile = buildProfile([]);
    expect(profile.slope).toBe(0);
    expect(profile.intercept).toBe(0);
    expect(profile.rSquared).toBe(0);
    expect(profile.estimated1RM).toBe(0);
    expect(profile.confidence).toBe('low');
  });

  it('handles all same load (vertical line)', () => {
    const profile = buildProfile([
      { load: 50, velocity: 0.80 },
      { load: 50, velocity: 0.82 },
      { load: 50, velocity: 0.78 },
    ]);
    expect(profile.slope).toBe(0);
    expect(profile.confidence).toBe('low');
  });

  it('preserves all data points', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    expect(profile.dataPoints).toHaveLength(5);
  });
});

// =============================================================================
// predictVelocity
// =============================================================================

describe('predictVelocity', () => {
  it('predicts correctly on the regression line', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    expect(predictVelocity(profile, 60)).toBeCloseTo(0.90, 2);
  });

  it('extrapolates beyond data range', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    // load = 120: -0.01 * 120 + 1.50 = 0.30
    expect(predictVelocity(profile, 120)).toBeCloseTo(0.30, 2);
  });

  it('clamps to 0 for very high loads', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    // load = 200: -0.01 * 200 + 1.50 = -0.50 -> clamp to 0
    expect(predictVelocity(profile, 200)).toBe(0);
  });
});

// =============================================================================
// estimateLoad
// =============================================================================

describe('estimateLoad', () => {
  it('estimates correctly from the regression line', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    // velocity 0.90 -> load 60
    expect(estimateLoad(profile, 0.90)).toBeCloseTo(60, 0);
  });

  it('round-trips with predictVelocity', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    const load = 70;
    const vel = predictVelocity(profile, load);
    expect(estimateLoad(profile, vel)).toBeCloseTo(load, 2);
  });

  it('clamps to 0 for unreasonably high velocity', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    // velocity = 2.0 -> load = (2.0 - 1.50) / -0.01 = -50 -> clamp to 0
    expect(estimateLoad(profile, 2.0)).toBe(0);
  });

  it('returns 0 for flat profile (slope = 0)', () => {
    const profile = buildProfile([{ load: 50, velocity: 0.80 }]);
    expect(estimateLoad(profile, 0.60)).toBe(0);
  });
});

// =============================================================================
// addDataPoint
// =============================================================================

describe('addDataPoint', () => {
  it('returns a new profile with the additional point', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    const updated = addDataPoint(profile, { load: 120, velocity: 0.30 });
    expect(updated.dataPoints).toHaveLength(6);
  });

  it('does not mutate the original profile', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    addDataPoint(profile, { load: 120, velocity: 0.30 });
    expect(profile.dataPoints).toHaveLength(5);
  });

  it('re-fits the regression with the new point', () => {
    const profile = buildProfile(PERFECT_LINEAR);
    const updated = addDataPoint(profile, { load: 120, velocity: 0.30 });
    // R² should still be very high
    expect(updated.rSquared).toBeGreaterThan(0.95);
  });
});
