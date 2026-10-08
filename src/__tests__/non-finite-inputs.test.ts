/**
 * Non-finite input table (VW-825).
 *
 * Each public numeric entry point given NaN or ±Infinity must throw, or return
 * its documented neutral value. It must never turn the bad input into a
 * confident, plausible-looking answer.
 */
import { describe, it, expect } from 'vitest';
import { estimatePercent1RMFromVelocity } from '@/vbt/constants';
import { categorizeVelocity } from '@/vbt/zones';
import { interpolate, DEFAULT_RIR_SCHEME } from '@/stats/schemes';
import { estimateSetRIR, updateSessionFatigueState } from '@/analytics/fatigue';
import { velocityLossVerdict } from '@/analytics/view-model';
import { estimateRIRWithProfile, type RIREstimateInputs } from '@/vbt/rir-exercise-specific';
import { createSet, addSampleToSet, type Set } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';

const NON_FINITE = [NaN, Infinity, -Infinity];

function concentricSample(sequence: number, velocity: number): WorkoutSample {
  return {
    sequence,
    timestamp: sequence * 500,
    phase: MovementPhase.CONCENTRIC,
    position: 0.5,
    velocity,
    force: 100,
  };
}

function eccentricSample(sequence: number): WorkoutSample {
  return { ...concentricSample(sequence, 0.25), phase: MovementPhase.ECCENTRIC };
}

/** A set of a 0.5 m/s rep followed by a rep with the given velocity. */
function setWithLastRepVelocity(velocity: number): Set {
  const samples = [
    concentricSample(0, 0.5),
    eccentricSample(1),
    concentricSample(2, velocity),
    eccentricSample(3),
  ];
  return samples.reduce(addSampleToSet, createSet());
}

const RIR_INPUTS: RIREstimateInputs = {
  peakVelocity: 0.6,
  baselineMaxVelocity: 0.8,
  velLossPct: 25,
  repIndex: 6,
};

type Outcome = { throws: true } | { returns: unknown };

interface Row {
  name: string;
  act: () => unknown;
  expected: Outcome;
}

const THROWS: Outcome = { throws: true };

const rows: Row[] = [
  ...NON_FINITE.map((v) => ({
    name: `estimatePercent1RMFromVelocity(${v}) throws`,
    act: () => estimatePercent1RMFromVelocity(v),
    expected: THROWS,
  })),
  ...NON_FINITE.map((v) => ({
    name: `categorizeVelocity(${v}) throws`,
    act: () => categorizeVelocity(v),
    expected: THROWS,
  })),
  ...NON_FINITE.map((v) => ({
    name: `interpolate(${v}) throws`,
    act: () => interpolate(v, DEFAULT_RIR_SCHEME),
    expected: THROWS,
  })),
  ...NON_FINITE.map((v) => ({
    name: `estimateSetRIR of a set whose last rep moved at ${v} m/s reads as no loss`,
    act: () => estimateSetRIR(setWithLastRepVelocity(v)),
    expected: { returns: { rir: 6, rpe: 4, confidence: 'low' } },
  })),
  ...NON_FINITE.map((v) => ({
    name: `velocityLossVerdict(${v}) is the no-signal verdict`,
    act: () => velocityLossVerdict(v),
    expected: { returns: velocityLossVerdict(null) },
  })),
  ...NON_FINITE.map((v) => ({
    name: `updateSessionFatigueState with prevF ${v} throws`,
    act: () => updateSessionFatigueState(v, 0.6, 0.8),
    expected: THROWS,
  })),
  ...NON_FINITE.map((v) => ({
    name: `updateSessionFatigueState with lambda ${v} throws`,
    act: () => updateSessionFatigueState(0.2, 0.6, 0.8, v),
    expected: THROWS,
  })),
  ...NON_FINITE.map((v) => ({
    name: `updateSessionFatigueState with fiSet ${v} keeps the previous state`,
    act: () => updateSessionFatigueState(0.2, v, 0.8),
    expected: { returns: 0.2 },
  })),
  ...NON_FINITE.map((v) => ({
    name: `updateSessionFatigueState with intensityRatio ${v} keeps the previous state`,
    act: () => updateSessionFatigueState(0.2, 0.6, v),
    expected: { returns: 0.2 },
  })),
  ...[0, -4, ...NON_FINITE].map((repsInSet) => ({
    name: `estimateRIRWithProfile with repsInSet ${repsInSet} is treated like null`,
    act: () => estimateRIRWithProfile({ ...RIR_INPUTS, repsInSet }),
    expected: { returns: estimateRIRWithProfile({ ...RIR_INPUTS, repsInSet: null }) },
  })),
];

describe('non-finite numeric inputs (VW-825)', () => {
  it.each(rows)('$name', ({ act, expected }) => {
    // Arrange: each row carries its own input.

    // Act
    const run = () => act();

    // Assert
    if ('throws' in expected) {
      expect(run).toThrow(RangeError);
    } else {
      expect(run()).toEqual(expected.returns);
    }
  });
});
