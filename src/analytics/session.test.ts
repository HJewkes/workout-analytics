/**
 * Session Analytics Tests
 */

import { describe, it, expect } from 'vitest';
import {
  computeStrengthEstimate,
  computeReadiness,
  computeSessionFatigue,
  computeVolume,
  computeEffectiveVolume,
} from '@/analytics/session';
import { buildProfile } from '@/vbt/profile';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Test Helpers
// =============================================================================

function buildSetFromSamples(samples: WorkoutSample[]): Set {
  let set = createSet();
  for (const sample of samples) {
    set = addSampleToSet(set, sample);
  }
  return set;
}

function createRepSamples(
  startSeq: number,
  startTime: number,
  velocity: number,
  rom: number = 200,
  conTimeMs: number = 500,
): WorkoutSample[] {
  return [
    { sequence: startSeq, timestamp: startTime, phase: MovementPhase.CONCENTRIC, position: 0, velocity, force: 100 },
    { sequence: startSeq + 1, timestamp: startTime + conTimeMs, phase: MovementPhase.CONCENTRIC, position: rom, velocity, force: 100 },
    { sequence: startSeq + 2, timestamp: startTime + conTimeMs + 500, phase: MovementPhase.ECCENTRIC, position: rom, velocity: velocity * 0.5, force: 80 },
    { sequence: startSeq + 3, timestamp: startTime + conTimeMs + 1500, phase: MovementPhase.ECCENTRIC, position: 0, velocity: velocity * 0.5, force: 80 },
  ];
}

function buildTestSet(numReps: number, v0: number = 0.80): Set {
  const samples: WorkoutSample[] = [];
  for (let i = 0; i < numReps; i++) {
    const velocity = v0 * (1 - i * 0.05);
    samples.push(...createRepSamples(i * 10, i * 3000, velocity));
  }
  return buildSetFromSamples(samples);
}

// =============================================================================
// computeStrengthEstimate
// =============================================================================

describe('computeStrengthEstimate', () => {
  it('returns zero for empty sets', () => {
    const result = computeStrengthEstimate([], []);
    expect(result.estimated1RM).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('estimates e1RM from reps (Epley)', () => {
    const set = buildTestSet(5);
    const result = computeStrengthEstimate([set], [80]);
    // Epley: 80 * (1 + 5/30) = 93.33
    expect(result.estimated1RM).toBeCloseTo(93.33, 0);
    expect(result.source).toBe('reps');
  });

  it('uses best e1RM from multiple sets', () => {
    const set1 = buildTestSet(5);
    const set2 = buildTestSet(3);
    // set1: 80 * (1 + 5/30) = 93.33
    // set2: 90 * (1 + 3/30) = 99.00
    const result = computeStrengthEstimate([set1, set2], [80, 90]);
    expect(result.estimated1RM).toBeCloseTo(99, 0);
  });

  it('uses hybrid method when profile available', () => {
    const set = buildTestSet(5);
    const profile = buildProfile([
      { load: 40, velocity: 1.10 },
      { load: 60, velocity: 0.90 },
      { load: 80, velocity: 0.70 },
    ]);
    const result = computeStrengthEstimate([set], [80], profile);
    expect(result.source).toBe('hybrid');
    expect(result.estimated1RM).toBeGreaterThan(0);
  });
});

// =============================================================================
// computeReadiness
// =============================================================================

describe('computeReadiness', () => {
  it('returns green when velocity >= 95% of baseline', () => {
    const result = computeReadiness(0.76, 0.80);
    expect(result.zone).toBe('green');
    expect(result.velocityRatio).toBeCloseTo(0.95, 2);
  });

  it('returns yellow when velocity is 85-95% of baseline', () => {
    const result = computeReadiness(0.72, 0.80);
    expect(result.zone).toBe('yellow');
  });

  it('returns red when velocity < 85% of baseline', () => {
    const result = computeReadiness(0.60, 0.80);
    expect(result.zone).toBe('red');
  });

  it('returns yellow with 0 confidence for zero inputs', () => {
    expect(computeReadiness(0, 0.80).confidence).toBe(0);
    expect(computeReadiness(0.80, 0).confidence).toBe(0);
  });

  it('velocity ratio is computed correctly', () => {
    const result = computeReadiness(0.72, 0.80);
    expect(result.velocityRatio).toBeCloseTo(0.9, 2);
  });
});

// =============================================================================
// computeSessionFatigue
// =============================================================================

describe('computeSessionFatigue', () => {
  it('returns zero fatigue for single set', () => {
    const set = buildTestSet(5);
    const result = computeSessionFatigue([set], [80]);
    expect(result.level).toBe(0);
    expect(result.velocityRecoveryPct).toBe(100);
  });

  it('detects velocity recovery loss across sets', () => {
    // First set with high velocity, last set with lower
    const set1 = buildTestSet(5, 0.80);
    const set2 = buildTestSet(5, 0.70);
    const set3 = buildTestSet(5, 0.60);
    const result = computeSessionFatigue([set1, set2, set3], [80, 80, 80]);
    expect(result.velocityRecoveryPct).toBeLessThan(100);
    expect(result.level).toBeGreaterThan(0);
  });

  it('detects rep drop across sets', () => {
    const set1 = buildTestSet(8, 0.80);
    const set2 = buildTestSet(5, 0.75);
    const result = computeSessionFatigue([set1, set2], [80, 80]);
    expect(result.repDropPct).toBeGreaterThan(0);
  });

  it('fatigue level is bounded 0-1', () => {
    const set1 = buildTestSet(5, 0.80);
    const set2 = buildTestSet(5, 0.40);
    const result = computeSessionFatigue([set1, set2], [80, 80]);
    expect(result.level).toBeGreaterThanOrEqual(0);
    expect(result.level).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// computeVolume
// =============================================================================

describe('computeVolume', () => {
  it('computes total volume (load * reps)', () => {
    const set1 = buildTestSet(5);
    const set2 = buildTestSet(3);
    const volume = computeVolume([set1, set2], [80, 90]);
    expect(volume).toBe(80 * 5 + 90 * 3); // 400 + 270 = 670
  });

  it('returns 0 for empty sets', () => {
    expect(computeVolume([], [])).toBe(0);
  });

  it('handles missing weights', () => {
    const set = buildTestSet(5);
    // weights array shorter than sets -> missing weight = 0
    const volume = computeVolume([set], []);
    expect(volume).toBe(0);
  });
});

// =============================================================================
// computeEffectiveVolume
// =============================================================================

describe('computeEffectiveVolume', () => {
  it('is less than or equal to raw volume', () => {
    const set = buildTestSet(5);
    const rawVolume = computeVolume([set], [80]);
    const effectiveVolume = computeEffectiveVolume([set], [80]);
    expect(effectiveVolume).toBeLessThanOrEqual(rawVolume);
    expect(effectiveVolume).toBeGreaterThan(0);
  });

  it('increases with load', () => {
    const set = buildTestSet(5);
    const ev80 = computeEffectiveVolume([set], [80]);
    const ev100 = computeEffectiveVolume([set], [100]);
    expect(ev100).toBeGreaterThan(ev80);
  });

  it('returns 0 for empty sets', () => {
    expect(computeEffectiveVolume([], [])).toBe(0);
  });

  it('responds to custom decay rate', () => {
    const set = buildTestSet(5);
    const steeper = computeEffectiveVolume([set], [80], { decayRate: 0.7 });
    const gentler = computeEffectiveVolume([set], [80], { decayRate: 0.2 });
    // Steeper decay = less contribution from easy reps = lower effective volume
    expect(steeper).toBeLessThan(gentler);
  });
});
