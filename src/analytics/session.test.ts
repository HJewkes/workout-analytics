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
import { buildBaseline, getExpectedVelocity, updateBaselineWithPoint } from '@/vbt/baseline';
import { getSetFirstRepVelocity } from '@/analytics/set-analytics';
import { getRepPeakVelocity } from '@/models/rep';
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

function buildTestSet(numReps: number, v0: number = 0.8): Set {
  const samples: WorkoutSample[] = [];
  for (let i = 0; i < numReps; i++) {
    const velocity = v0 * (1 - i * 0.05);
    samples.push(...createRepSamples(i * 10, i * 3000, velocity));
  }
  return buildSetFromSamples(samples);
}

/** First rep's concentric velocity rises and falls, so its peak sits well above its mean. */
function buildSetWithUnevenFirstRep(): Set {
  const concentric = [0.3, 1.0, 0.5].map(
    (velocity, i): WorkoutSample => ({
      sequence: i,
      timestamp: i * 200,
      phase: MovementPhase.CONCENTRIC,
      position: i * 100,
      velocity,
      force: 100,
    })
  );
  const eccentric = createRepSamples(0, 0, 0.6).slice(2);
  const tail = eccentric.map((s, i) => ({ ...s, sequence: 3 + i, timestamp: 600 + i * 500 }));
  return buildSetFromSamples([...concentric, ...tail, ...createRepSamples(10, 3000, 0.6)]);
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

  it('a 3-rep set at 90 lb outranks a 20-rep set at 60 lb', () => {
    // 3 @ 90: Epley 99, confidence 0.9. 20 @ 60: Epley 100, confidence 0.3.
    const result = computeStrengthEstimate([buildTestSet(20), buildTestSet(3)], [60, 90]);
    expect(result.estimated1RM).toBeCloseTo(99, 5);
    expect(result.confidence).toBe(0.9);
  });

  it('a light warm-up set does not outrank a heavy working set', () => {
    // 5 @ 20 is in the most confident band, but 6 @ 100 (Epley 120) is the lift.
    const result = computeStrengthEstimate([buildTestSet(5), buildTestSet(6)], [20, 100]);
    expect(result.estimated1RM).toBeCloseTo(120, 5);
  });

  it('a heavy single outranks a light 5-rep set', () => {
    const result = computeStrengthEstimate([buildTestSet(1), buildTestSet(5)], [100, 60]);
    expect(result.estimated1RM).toBeCloseTo(103.33, 1);
  });

  it('a 5-rep warm-up at 30 does not outrank a 20-rep set at 60', () => {
    const result = computeStrengthEstimate([buildTestSet(20), buildTestSet(5)], [60, 30]);
    expect(result.estimated1RM).toBeCloseTo(100, 5);
    expect(result.confidence).toBeCloseTo(0.3, 10);
  });

  it('a 5-rep warm-up at 25 does not outrank three 20-rep sets at 40', () => {
    const work = [buildTestSet(20), buildTestSet(20), buildTestSet(20)];
    const result = computeStrengthEstimate([buildTestSet(5), ...work], [25, 40, 40, 40]);
    expect(result.estimated1RM).toBeCloseTo(66.67, 1);
  });

  it('a single at 90 after a 15-rep set at 100 does not set the estimate', () => {
    const result = computeStrengthEstimate([buildTestSet(15), buildTestSet(1)], [100, 90]);
    expect(result.estimated1RM).toBeCloseTo(150, 5);
  });

  it('a single at 95 after a 10-rep set at 90 does not set the estimate', () => {
    const result = computeStrengthEstimate([buildTestSet(10), buildTestSet(1)], [90, 95]);
    expect(result.estimated1RM).toBeCloseTo(120, 5);
  });

  it('uses hybrid method when profile available', () => {
    const set = buildTestSet(5);
    const profile = buildProfile([
      { load: 40, velocity: 1.1 },
      { load: 60, velocity: 0.9 },
      { load: 80, velocity: 0.7 },
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
    const result = computeReadiness(0.76, 0.8);
    expect(result.zone).toBe('green');
    expect(result.velocityRatio).toBeCloseTo(0.95, 2);
  });

  it('returns yellow when velocity is 85-95% of baseline', () => {
    const result = computeReadiness(0.72, 0.8);
    expect(result.zone).toBe('yellow');
  });

  it('returns red when velocity < 85% of baseline', () => {
    const result = computeReadiness(0.6, 0.8);
    expect(result.zone).toBe('red');
  });

  it('returns yellow with 0 confidence for zero inputs', () => {
    expect(computeReadiness(0, 0.8).confidence).toBe(0);
    expect(computeReadiness(0.8, 0).confidence).toBe(0);
  });

  it('velocity ratio is computed correctly', () => {
    const result = computeReadiness(0.72, 0.8);
    expect(result.velocityRatio).toBeCloseTo(0.9, 2);
  });

  it('the documented baseline-to-readiness path uses one velocity kind end to end', () => {
    const load = 60;
    const set = buildSetWithUnevenFirstRep();
    const firstRepMean = getSetFirstRepVelocity(set);
    // A baseline fed peak velocity would put this same rep below the red cutoff.
    expect(firstRepMean / getRepPeakVelocity(set.reps[0])).toBeLessThan(0.85);

    const baseline = updateBaselineWithPoint(buildBaseline([]), load, firstRepMean, {
      timestamp: 0,
    });
    const readiness = computeReadiness(
      getSetFirstRepVelocity(set),
      getExpectedVelocity(baseline, load)!
    );

    expect(readiness.velocityRatio).toBeCloseTo(1, 10);
    expect(readiness.zone).toBe('green');
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
    const set1 = buildTestSet(5, 0.8);
    const set2 = buildTestSet(5, 0.7);
    const set3 = buildTestSet(5, 0.6);
    const result = computeSessionFatigue([set1, set2, set3], [80, 80, 80]);
    expect(result.velocityRecoveryPct).toBeLessThan(100);
    expect(result.level).toBeGreaterThan(0);
  });

  it('detects rep drop across sets', () => {
    const set1 = buildTestSet(8, 0.8);
    const set2 = buildTestSet(5, 0.75);
    const result = computeSessionFatigue([set1, set2], [80, 80]);
    expect(result.repDropPct).toBeGreaterThan(0);
  });

  it('fatigue level is bounded 0-1', () => {
    const set1 = buildTestSet(5, 0.8);
    const set2 = buildTestSet(5, 0.4);
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
