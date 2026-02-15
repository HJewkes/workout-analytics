/**
 * Velocity Baseline Tests
 */

import { describe, it, expect } from 'vitest';
import { buildBaseline, getExpectedVelocity } from '@/vbt/baseline';
import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Test Data
// =============================================================================

const HISTORICAL_DATA: LoadVelocityDataPoint[] = [
  { load: 30, velocity: 1.00 },
  { load: 50, velocity: 0.75 },
  { load: 70, velocity: 0.55 },
  { load: 90, velocity: 0.30 },
];

// =============================================================================
// buildBaseline
// =============================================================================

describe('buildBaseline', () => {
  it('sorts data points by load', () => {
    const unsorted: LoadVelocityDataPoint[] = [
      { load: 70, velocity: 0.55 },
      { load: 30, velocity: 1.00 },
      { load: 50, velocity: 0.75 },
    ];
    const baseline = buildBaseline(unsorted);
    expect(baseline.dataPoints[0].load).toBe(30);
    expect(baseline.dataPoints[1].load).toBe(50);
    expect(baseline.dataPoints[2].load).toBe(70);
  });

  it('handles empty input', () => {
    const baseline = buildBaseline([]);
    expect(baseline.dataPoints).toHaveLength(0);
  });

  it('preserves all data points', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(baseline.dataPoints).toHaveLength(4);
  });
});

// =============================================================================
// getExpectedVelocity
// =============================================================================

describe('getExpectedVelocity', () => {
  it('returns exact velocity at known load', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(getExpectedVelocity(baseline, 30)).toBe(1.00);
    expect(getExpectedVelocity(baseline, 90)).toBe(0.30);
  });

  it('interpolates between known loads', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    // 40 is between 30 (1.00) and 50 (0.75) -> 0.875
    expect(getExpectedVelocity(baseline, 40)).toBeCloseTo(0.875, 3);
  });

  it('interpolates at midpoint correctly', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    // 60 is between 50 (0.75) and 70 (0.55) -> 0.65
    expect(getExpectedVelocity(baseline, 60)).toBeCloseTo(0.65, 3);
  });

  it('returns null for load below range', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(getExpectedVelocity(baseline, 10)).toBeNull();
  });

  it('returns null for load above range', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(getExpectedVelocity(baseline, 100)).toBeNull();
  });

  it('returns null for empty baseline', () => {
    const baseline = buildBaseline([]);
    expect(getExpectedVelocity(baseline, 50)).toBeNull();
  });

  it('returns velocity for single point only if load matches exactly', () => {
    const baseline = buildBaseline([{ load: 50, velocity: 0.75 }]);
    expect(getExpectedVelocity(baseline, 50)).toBe(0.75);
    expect(getExpectedVelocity(baseline, 51)).toBeNull();
  });
});
