/**
 * VBT Constants Tests
 */

import { describe, it, expect } from 'vitest';
import {
  VELOCITY_AT_PERCENT_1RM,
  DEFAULT_MVT,
  DEFAULT_VELOCITY_RIR_MAP,
  estimatePercent1RMFromVelocity,
} from '@/vbt/constants';
import { interpolate } from '@/stats/schemes';

// =============================================================================
// VELOCITY_AT_PERCENT_1RM
// =============================================================================

describe('VELOCITY_AT_PERCENT_1RM', () => {
  it('has entries from 30% to 100%', () => {
    expect(VELOCITY_AT_PERCENT_1RM[30]).toBeDefined();
    expect(VELOCITY_AT_PERCENT_1RM[100]).toBeDefined();
  });

  it('velocities decrease as %1RM increases', () => {
    const percents = Object.keys(VELOCITY_AT_PERCENT_1RM)
      .map(Number)
      .sort((a, b) => a - b);
    for (let i = 0; i < percents.length - 1; i++) {
      expect(VELOCITY_AT_PERCENT_1RM[percents[i]]).toBeGreaterThan(
        VELOCITY_AT_PERCENT_1RM[percents[i + 1]]
      );
    }
  });

  it('100% velocity equals DEFAULT_MVT', () => {
    expect(VELOCITY_AT_PERCENT_1RM[100]).toBe(DEFAULT_MVT);
  });
});

// =============================================================================
// DEFAULT_MVT
// =============================================================================

describe('DEFAULT_MVT', () => {
  it('is 0.17 m/s', () => {
    expect(DEFAULT_MVT).toBe(0.17);
  });
});

// =============================================================================
// DEFAULT_VELOCITY_RIR_MAP
// =============================================================================

describe('DEFAULT_VELOCITY_RIR_MAP', () => {
  it('maps 0% velocity loss to RIR 6', () => {
    expect(interpolate(0, DEFAULT_VELOCITY_RIR_MAP)).toBe(6);
  });

  it('maps 60% velocity loss to RIR 0', () => {
    expect(interpolate(60, DEFAULT_VELOCITY_RIR_MAP)).toBe(0);
  });

  it('interpolates between points', () => {
    // 25% is between 20% (RIR 4) and 30% (RIR 3) -> 3.5
    expect(interpolate(25, DEFAULT_VELOCITY_RIR_MAP)).toBe(3.5);
  });

  it('clamps above 60%', () => {
    expect(interpolate(80, DEFAULT_VELOCITY_RIR_MAP)).toBe(0);
  });
});

// =============================================================================
// estimatePercent1RMFromVelocity
// =============================================================================

describe('estimatePercent1RMFromVelocity', () => {
  it('returns 100 at or below MVT', () => {
    expect(estimatePercent1RMFromVelocity(0.17)).toBe(100);
    expect(estimatePercent1RMFromVelocity(0.1)).toBe(100);
  });

  it('returns 30 at or above highest velocity', () => {
    expect(estimatePercent1RMFromVelocity(1.5)).toBe(30);
    expect(estimatePercent1RMFromVelocity(1.28)).toBe(30);
  });

  it('returns known table values at exact velocities', () => {
    // 0.62 m/s -> 70%
    expect(estimatePercent1RMFromVelocity(0.62)).toBeCloseTo(70, 0);
    // 0.46 m/s -> 80%
    expect(estimatePercent1RMFromVelocity(0.46)).toBeCloseTo(80, 0);
  });

  it('interpolates between table values', () => {
    // 0.54 is exactly 75%, 0.50 should be between 75 and 80
    const pct = estimatePercent1RMFromVelocity(0.5);
    expect(pct).toBeGreaterThan(75);
    expect(pct).toBeLessThan(80);
  });

  it('is monotonically decreasing (higher velocity = lower %1RM)', () => {
    const velocities = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0];
    const percents = velocities.map(estimatePercent1RMFromVelocity);
    for (let i = 0; i < percents.length - 1; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i + 1]);
    }
  });
});
