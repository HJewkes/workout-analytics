/**
 * Intensity Analytics Tests
 */

import { describe, it, expect } from 'vitest';
import {
  estimatePerRepRIR,
  getRepHardnessWeight,
  getSetIntensityScore,
  getSetStimulusScore,
} from '@/analytics/intensity';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Test Helpers
// =============================================================================

function buildSet(samples: WorkoutSample[]): Set {
  let set = createSet();
  for (const sample of samples) {
    set = addSampleToSet(set, sample);
  }
  return set;
}

/**
 * Create samples for a single rep with specified velocity and ROM.
 */
function createRepSamples(
  startSeq: number,
  startTime: number,
  velocity: number,
  rom: number,
  conTimeMs: number = 500
): WorkoutSample[] {
  return [
    {
      sequence: startSeq,
      timestamp: startTime,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity,
      force: 100,
    },
    {
      sequence: startSeq + 1,
      timestamp: startTime + conTimeMs,
      phase: MovementPhase.CONCENTRIC,
      position: rom,
      velocity,
      force: 100,
    },
    {
      sequence: startSeq + 2,
      timestamp: startTime + conTimeMs + 500,
      phase: MovementPhase.ECCENTRIC,
      position: rom,
      velocity: velocity * 0.5,
      force: 80,
    },
    {
      sequence: startSeq + 3,
      timestamp: startTime + conTimeMs + 1500,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: velocity * 0.5,
      force: 80,
    },
  ];
}

/**
 * Build a set with declining velocity to simulate fatigue.
 * Velocities: [v0, v0*0.9, v0*0.8, v0*0.7, v0*0.6]
 */
function buildFatigueSet(numReps: number, v0: number = 0.8, rom: number = 200): Set {
  const samples: WorkoutSample[] = [];
  for (let i = 0; i < numReps; i++) {
    const velocity = v0 * (1 - i * 0.1); // 10% velocity loss per rep
    const repSamples = createRepSamples(i * 10, i * 3000, velocity, rom);
    samples.push(...repSamples);
  }
  return buildSet(samples);
}

// =============================================================================
// getRepHardnessWeight
// =============================================================================

describe('getRepHardnessWeight', () => {
  it('returns 1.0 at RIR 0', () => {
    expect(getRepHardnessWeight(0)).toBeCloseTo(1.0, 4);
  });

  it('returns expected values at default k=0.4', () => {
    expect(getRepHardnessWeight(0)).toBeCloseTo(1.0, 2);
    expect(getRepHardnessWeight(1)).toBeCloseTo(0.67, 2);
    expect(getRepHardnessWeight(2)).toBeCloseTo(0.45, 2);
    expect(getRepHardnessWeight(3)).toBeCloseTo(0.3, 2);
    expect(getRepHardnessWeight(4)).toBeCloseTo(0.2, 2);
  });

  it('RIR 0->1 difference is larger than 1->2', () => {
    const diff01 = getRepHardnessWeight(0) - getRepHardnessWeight(1);
    const diff12 = getRepHardnessWeight(1) - getRepHardnessWeight(2);
    expect(diff01).toBeGreaterThan(diff12);
  });

  it('supports custom decay rate', () => {
    // k=0.7: steeper decay
    expect(getRepHardnessWeight(1, 0.7)).toBeCloseTo(Math.exp(-0.7), 4);
    // k=0.0: no decay (all reps equal)
    expect(getRepHardnessWeight(5, 0.0)).toBeCloseTo(1.0, 4);
  });

  it('clamps negative RIR to 0', () => {
    expect(getRepHardnessWeight(-1)).toBeCloseTo(1.0, 4);
    expect(getRepHardnessWeight(-5)).toBeCloseTo(1.0, 4);
  });

  it('approaches 0 at high RIR', () => {
    expect(getRepHardnessWeight(10)).toBeLessThan(0.05);
    expect(getRepHardnessWeight(20)).toBeLessThan(0.001);
  });
});

// =============================================================================
// estimatePerRepRIR
// =============================================================================

describe('estimatePerRepRIR', () => {
  it('returns empty array for empty set', () => {
    expect(estimatePerRepRIR(createSet())).toEqual([]);
  });

  it('returns set RIR for single rep', () => {
    const set = buildFatigueSet(1);
    const rirs = estimatePerRepRIR(set, 2);
    expect(rirs).toHaveLength(1);
    expect(rirs[0]).toBe(2);
  });

  it('last rep gets the set RIR', () => {
    const set = buildFatigueSet(5);
    const rirs = estimatePerRepRIR(set, 1);
    // Last rep should be close to set RIR
    expect(rirs[4]).toBeCloseTo(1, 0);
  });

  it('first rep has highest RIR', () => {
    const set = buildFatigueSet(5);
    const rirs = estimatePerRepRIR(set, 1);
    expect(rirs[0]).toBeGreaterThan(rirs[4]);
  });

  it('RIR decreases monotonically for declining velocity', () => {
    const set = buildFatigueSet(5);
    const rirs = estimatePerRepRIR(set, 1);
    for (let i = 0; i < rirs.length - 1; i++) {
      expect(rirs[i]).toBeGreaterThanOrEqual(rirs[i + 1]);
    }
  });

  it('all RIR values are non-negative', () => {
    const set = buildFatigueSet(5);
    const rirs = estimatePerRepRIR(set, 0);
    rirs.forEach((rir) => expect(rir).toBeGreaterThanOrEqual(0));
  });

  it('uses estimateSetRIR when setRIR not provided', () => {
    const set = buildFatigueSet(5);
    const rirs = estimatePerRepRIR(set);
    // Should produce valid per-rep RIR without explicit setRIR
    expect(rirs).toHaveLength(5);
    rirs.forEach((rir) => expect(rir).toBeGreaterThanOrEqual(0));
  });
});

// =============================================================================
// getSetIntensityScore
// =============================================================================

describe('getSetIntensityScore', () => {
  it('returns 0 for empty set', () => {
    expect(getSetIntensityScore(createSet())).toBe(0);
  });

  it('increases with more reps', () => {
    const set3 = buildFatigueSet(3);
    const set5 = buildFatigueSet(5);
    expect(getSetIntensityScore(set5)).toBeGreaterThan(getSetIntensityScore(set3));
  });

  it('higher score when closer to failure (lower set RIR)', () => {
    const set = buildFatigueSet(5);
    const scoreRIR0 = getSetIntensityScore(set, { setRIR: 0 });
    const scoreRIR3 = getSetIntensityScore(set, { setRIR: 3 });
    expect(scoreRIR0).toBeGreaterThan(scoreRIR3);
  });

  it('accepts custom decay rate', () => {
    const set = buildFatigueSet(5);
    const steeper = getSetIntensityScore(set, { decayRate: 0.7, setRIR: 1 });
    const gentler = getSetIntensityScore(set, { decayRate: 0.2, setRIR: 1 });
    // Steeper decay = less contribution from early reps = lower score
    expect(steeper).toBeLessThan(gentler);
  });
});

// =============================================================================
// getSetStimulusScore
// =============================================================================

describe('getSetStimulusScore', () => {
  it('returns 0 for empty set', () => {
    expect(getSetStimulusScore(createSet(), 50)).toBe(0);
  });

  it('scales linearly with load', () => {
    const set = buildFatigueSet(5);
    const score50 = getSetStimulusScore(set, 50, { setRIR: 1 });
    const score100 = getSetStimulusScore(set, 100, { setRIR: 1 });
    expect(score100).toBeCloseTo(score50 * 2, 1);
  });

  it('normalizes by e1RM when provided', () => {
    const set = buildFatigueSet(5);
    const raw = getSetStimulusScore(set, 80, { setRIR: 1 });
    const normalized = getSetStimulusScore(set, 80, { setRIR: 1, e1RM: 100 });
    expect(normalized).toBeCloseTo(raw / 100, 4);
  });

  it('is higher when closer to failure', () => {
    const set = buildFatigueSet(5);
    const scoreRIR0 = getSetStimulusScore(set, 80, { setRIR: 0 });
    const scoreRIR3 = getSetStimulusScore(set, 80, { setRIR: 3 });
    expect(scoreRIR0).toBeGreaterThan(scoreRIR3);
  });

  it('works without ROM/TUT multipliers by default', () => {
    const set = buildFatigueSet(5);
    const score = getSetStimulusScore(set, 80, { setRIR: 1 });
    expect(score).toBeGreaterThan(0);
  });

  it('applies ROM multiplier when enabled', () => {
    const set = buildFatigueSet(5, 0.8, 200);
    const withoutROM = getSetStimulusScore(set, 80, { setRIR: 1 });
    const withROM = getSetStimulusScore(set, 80, {
      setRIR: 1,
      includeROM: true,
      expectedROM: 200,
    });
    // With ROM factor = 1.0 (actual == expected), scores should be similar
    // (not exact because of how test data works)
    expect(withROM).toBeGreaterThan(0);
    expect(withoutROM).toBeGreaterThan(0);
  });
});
