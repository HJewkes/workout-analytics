/**
 * e1RM Estimation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  estimateE1RMFromProfile,
  estimateE1RMFromReps,
  estimateHybridE1RM,
  type E1RMEstimate,
} from '@/vbt/e1rm';
import { buildProfile, type LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Test Data
// =============================================================================

/** Perfect linear: velocity = -0.01 * load + 1.5 -> e1RM at MVT(0.17) = 133 */
const LINEAR_DATA: LoadVelocityDataPoint[] = [
  { load: 20, velocity: 1.30 },
  { load: 40, velocity: 1.10 },
  { load: 60, velocity: 0.90 },
  { load: 80, velocity: 0.70 },
  { load: 100, velocity: 0.50 },
];

// =============================================================================
// estimateE1RMFromProfile
// =============================================================================

describe('estimateE1RMFromProfile', () => {
  it('estimates e1RM from a good profile', () => {
    const profile = buildProfile(LINEAR_DATA);
    const result = estimateE1RMFromProfile(profile);
    // velocity = -0.01 * load + 1.50 -> at 0.17: load = 133
    expect(result.e1RM).toBeCloseTo(133, 0);
    expect(result.method).toBe('profile');
  });

  it('has high confidence for good profile', () => {
    const profile = buildProfile(LINEAR_DATA);
    const result = estimateE1RMFromProfile(profile);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('respects custom MVT', () => {
    const profile = buildProfile(LINEAR_DATA);
    const result = estimateE1RMFromProfile(profile, 0.30);
    // 0.30 = -0.01 * load + 1.50 -> load = 120
    expect(result.e1RM).toBeCloseTo(120, 0);
  });

  it('returns 0 for empty profile', () => {
    const profile = buildProfile([]);
    const result = estimateE1RMFromProfile(profile);
    expect(result.e1RM).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('returns 0 for flat profile (slope=0)', () => {
    const profile = buildProfile([{ load: 50, velocity: 0.80 }]);
    const result = estimateE1RMFromProfile(profile);
    expect(result.e1RM).toBe(0);
  });

  it('confidence increases with more data points', () => {
    const twoPoints = buildProfile(LINEAR_DATA.slice(0, 2));
    const fivePoints = buildProfile(LINEAR_DATA);
    const conf2 = estimateE1RMFromProfile(twoPoints).confidence;
    const conf5 = estimateE1RMFromProfile(fivePoints).confidence;
    expect(conf5).toBeGreaterThan(conf2);
  });
});

// =============================================================================
// estimateE1RMFromReps
// =============================================================================

describe('estimateE1RMFromReps', () => {
  it('applies Epley formula correctly', () => {
    // 100kg * (1 + 5/30) = 100 * 1.1667 = 116.67
    const result = estimateE1RMFromReps(100, 5);
    expect(result.e1RM).toBeCloseTo(116.67, 1);
    expect(result.method).toBe('reps');
  });

  it('at 1 rep, e1RM is close to the load', () => {
    const result = estimateE1RMFromReps(100, 1);
    expect(result.e1RM).toBeCloseTo(103.33, 1);
  });

  it('at 10 reps, multiplier is 1.333', () => {
    const result = estimateE1RMFromReps(75, 10);
    expect(result.e1RM).toBeCloseTo(100, 0);
  });

  it('has high confidence at 3-5 reps', () => {
    expect(estimateE1RMFromReps(100, 3).confidence).toBe(0.9);
    expect(estimateE1RMFromReps(100, 5).confidence).toBe(0.9);
  });

  it('has lower confidence at high reps', () => {
    expect(estimateE1RMFromReps(100, 15).confidence).toBeLessThan(0.7);
    expect(estimateE1RMFromReps(100, 20).confidence).toBeLessThan(0.5);
  });

  it('returns 0 for invalid inputs', () => {
    expect(estimateE1RMFromReps(0, 5).e1RM).toBe(0);
    expect(estimateE1RMFromReps(100, 0).e1RM).toBe(0);
    expect(estimateE1RMFromReps(-10, 5).e1RM).toBe(0);
  });
});

// =============================================================================
// estimateHybridE1RM
// =============================================================================

describe('estimateHybridE1RM', () => {
  it('produces weighted average of two estimates', () => {
    const velEst: E1RMEstimate = { e1RM: 130, confidence: 0.9, method: 'profile' };
    const repEst: E1RMEstimate = { e1RM: 120, confidence: 0.8, method: 'reps' };
    const hybrid = estimateHybridE1RM(velEst, repEst);

    // Weighted: (130*0.9 + 120*0.8) / (0.9 + 0.8) = (117 + 96) / 1.7 = 125.3
    expect(hybrid.e1RM).toBeCloseTo(125.3, 0);
    expect(hybrid.method).toBe('hybrid');
  });

  it('favors higher confidence estimate', () => {
    const highConf: E1RMEstimate = { e1RM: 130, confidence: 0.95, method: 'profile' };
    const lowConf: E1RMEstimate = { e1RM: 100, confidence: 0.3, method: 'reps' };
    const hybrid = estimateHybridE1RM(highConf, lowConf);

    // Should be closer to 130 (high conf) than 100 (low conf)
    expect(hybrid.e1RM).toBeGreaterThan(115);
  });

  it('returns 0 when both have zero confidence', () => {
    const zero1: E1RMEstimate = { e1RM: 100, confidence: 0, method: 'profile' };
    const zero2: E1RMEstimate = { e1RM: 120, confidence: 0, method: 'reps' };
    const hybrid = estimateHybridE1RM(zero1, zero2);
    expect(hybrid.e1RM).toBe(0);
    expect(hybrid.confidence).toBe(0);
  });

  it('has higher confidence when estimates agree', () => {
    const agree1: E1RMEstimate = { e1RM: 100, confidence: 0.8, method: 'profile' };
    const agree2: E1RMEstimate = { e1RM: 102, confidence: 0.8, method: 'reps' };
    const disagree1: E1RMEstimate = { e1RM: 100, confidence: 0.8, method: 'profile' };
    const disagree2: E1RMEstimate = { e1RM: 150, confidence: 0.8, method: 'reps' };

    const agreeResult = estimateHybridE1RM(agree1, agree2);
    const disagreeResult = estimateHybridE1RM(disagree1, disagree2);

    expect(agreeResult.confidence).toBeGreaterThan(disagreeResult.confidence);
  });

  it('confidence is bounded 0-1', () => {
    const est1: E1RMEstimate = { e1RM: 100, confidence: 1.0, method: 'profile' };
    const est2: E1RMEstimate = { e1RM: 100, confidence: 1.0, method: 'reps' };
    const hybrid = estimateHybridE1RM(est1, est2);
    expect(hybrid.confidence).toBeLessThanOrEqual(1);
    expect(hybrid.confidence).toBeGreaterThanOrEqual(0);
  });
});
