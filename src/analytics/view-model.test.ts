/**
 * View-Model Derivation Tests
 *
 * These derivations feed workout views (dashboard, mobile). The contract under
 * test is: EXACT values (no display rounding) + `null` on genuine no-signal.
 * Where a derivation wraps existing WA math we assert it equals that math
 * exactly, proving nothing is rounded or converted on the way out.
 */
import { describe, it, expect } from 'vitest';
import {
  estimateSetRpe,
  getSetRepPeakVelocities,
  getSetTempoSeconds,
  bestE1RMAcrossSets,
  isNewE1RM,
  weightDeviationRatio,
  classifyWeeklyVolume,
} from '@/analytics/view-model';
import { estimateSetRIR } from '@/analytics/fatigue';
import { createSet, addSampleToSet } from '@/models/set';
import { getRepPeakVelocity } from '@/models/rep';
import { getPhaseHoldDuration, getPhaseMovementDuration } from '@/models/phase';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

function buildSet(samples: WorkoutSample[]): Set {
  let set = createSet();
  for (const sample of samples) set = addSampleToSet(set, sample);
  return set;
}

function createRepSamples(seq: number, t: number, velocity: number, rom: number): WorkoutSample[] {
  return [
    {
      sequence: seq,
      timestamp: t,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity,
      force: 100,
    },
    {
      sequence: seq + 1,
      timestamp: t + 500,
      phase: MovementPhase.CONCENTRIC,
      position: rom,
      velocity,
      force: 100,
    },
    {
      sequence: seq + 2,
      timestamp: t + 1000,
      phase: MovementPhase.ECCENTRIC,
      position: rom,
      velocity: velocity * 0.5,
      force: 80,
    },
    {
      sequence: seq + 3,
      timestamp: t + 2000,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: velocity * 0.5,
      force: 80,
    },
  ];
}

/** Three reps with declining velocity — a finite velocity-loss signal. */
function decliningSet(): Set {
  return buildSet([
    ...createRepSamples(0, 1000, 0.6, 1.0),
    ...createRepSamples(4, 3000, 0.5, 0.95),
    ...createRepSamples(8, 5000, 0.4, 0.9),
  ]);
}

describe('estimateSetRpe', () => {
  it('returns null for fewer than two reps (no velocity-loss signal)', () => {
    const oneRep = buildSet(createRepSamples(0, 1000, 0.6, 1.0));
    expect(estimateSetRpe(oneRep)).toBeNull();
  });

  it('returns the exact WA RIR-derived RPE (unrounded) when there is signal', () => {
    const set = decliningSet();
    const rpe = estimateSetRpe(set);
    expect(rpe).not.toBeNull();
    // Exactly WA's value — proves no 0.5 rounding is applied at this layer.
    expect(rpe).toBe(estimateSetRIR(set).rpe);
    expect(rpe as number).toBeGreaterThanOrEqual(4);
    expect(rpe as number).toBeLessThanOrEqual(10);
  });
});

describe('getSetRepPeakVelocities', () => {
  it('returns each rep peak velocity exactly, in the sample unit (no conversion)', () => {
    const set = decliningSet();
    const velocities = getSetRepPeakVelocities(set);
    expect(velocities).toHaveLength(3);
    // Each entry equals the raw WA per-rep peak — no ÷1000, no rounding.
    velocities.forEach((v, i) => expect(v).toBe(getRepPeakVelocity(set.reps[i])));
  });

  it('returns an empty array for a set with no reps', () => {
    expect(getSetRepPeakVelocities(createSet())).toEqual([]);
  });
});

describe('getSetTempoSeconds', () => {
  it('returns exact phase seconds from the most recent timed rep', () => {
    const set = decliningSet();
    const tempo = getSetTempoSeconds(set);
    expect(tempo).not.toBeNull();
    const last = set.reps[set.reps.length - 1];
    expect(tempo).toEqual([
      getPhaseMovementDuration(last.eccentric),
      getPhaseHoldDuration(last.eccentric),
      getPhaseMovementDuration(last.concentric),
      getPhaseHoldDuration(last.concentric),
    ]);
    expect((tempo as number[]).some((v) => v > 0)).toBe(true);
  });

  it('returns null for a set with no reps', () => {
    expect(getSetTempoSeconds(createSet())).toBeNull();
  });
});

describe('bestE1RMAcrossSets', () => {
  it('returns the exact maximum Epley estimate across sets (unrounded)', () => {
    // 100×5 → 100×(1+5/30) = 116.66…; 90×3 → 99; max is the 5-rep set.
    const best = bestE1RMAcrossSets([
      { load: 90, reps: 3 },
      { load: 100, reps: 5 },
    ]);
    expect(best).toBeCloseTo(100 * (1 + 5 / 30), 10);
    // Not rounded to an integer.
    expect(Number.isInteger(best)).toBe(false);
  });

  it('skips sets with no load or no reps, and returns null when none qualify', () => {
    expect(
      bestE1RMAcrossSets([
        { load: null, reps: 5 },
        { load: 100, reps: 0 },
      ])
    ).toBeNull();
    expect(bestE1RMAcrossSets([])).toBeNull();
    expect(bestE1RMAcrossSets([{ load: 0, reps: 5 }])).toBeNull();
  });
});

describe('isNewE1RM', () => {
  it('is true only when a current estimate exceeds a real historical best', () => {
    expect(isNewE1RM(120, 110)).toBe(true);
    expect(isNewE1RM(110, 110)).toBe(false);
    expect(isNewE1RM(100, 110)).toBe(false);
  });

  it('is false without a historical baseline (nothing to beat)', () => {
    expect(isNewE1RM(120, null)).toBe(false);
    expect(isNewE1RM(null, 110)).toBe(false);
    expect(isNewE1RM(undefined, 110)).toBe(false);
  });
});

describe('weightDeviationRatio', () => {
  it('returns the exact signed fraction (no ×100, no rounding)', () => {
    expect(weightDeviationRatio(109, 100)).toBeCloseTo(0.09, 10);
    expect(weightDeviationRatio(95, 100)).toBeCloseTo(-0.05, 10);
  });

  it('returns null when either weight is missing or prescription is non-positive', () => {
    expect(weightDeviationRatio(null, 100)).toBeNull();
    expect(weightDeviationRatio(100, null)).toBeNull();
    expect(weightDeviationRatio(100, 0)).toBeNull();
  });
});

describe('classifyWeeklyVolume', () => {
  const landmarks = { mev: 8, mav: 14, mrv: 20 };

  it('classifies against MEV/MAV/MRV boundaries', () => {
    expect(classifyWeeklyVolume(5, landmarks)).toBe('under');
    expect(classifyWeeklyVolume(8, landmarks)).toBe('maintenance');
    expect(classifyWeeklyVolume(13, landmarks)).toBe('maintenance');
    expect(classifyWeeklyVolume(14, landmarks)).toBe('productive');
    expect(classifyWeeklyVolume(19, landmarks)).toBe('productive');
    expect(classifyWeeklyVolume(20, landmarks)).toBe('over');
    expect(classifyWeeklyVolume(25, landmarks)).toBe('over');
  });
});
