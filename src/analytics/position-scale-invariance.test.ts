/**
 * Position scale-invariance.
 *
 * The 2.0.0 release note claims that redefining `WorkoutSample.position` from a
 * normalised 0–1 fraction to metres leaves every RATIO-based analytic unchanged
 * in value, and only moves absolute (displacement-carrying) outputs. Nothing
 * enforced that claim — this file does.
 *
 * Method: take one fixture set, multiply every `position` by an arbitrary
 * factor, and assert the ratio outputs are unchanged while the absolute ones
 * scale by exactly that factor. The factor 1000 is the real-world case
 * (device-native millimetre-ish units vs metres), but the property should hold
 * for any positive factor, so several are exercised.
 *
 * Invariance is exact in the reals but NOT bit-exact in IEEE-754: scaling
 * changes the rounding of the intermediate products, so e.g. a percent change
 * comes back as -29.03225806451613 rather than -29.032258064516125. The
 * discrepancy is at the last representable digit (~1e-14 relative), so the
 * numeric assertions use a tolerance. Anything larger would be a real break.
 */

import { describe, it, expect } from 'vitest';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import { getRepRangeOfMotion } from '@/models/rep';
import { getRepROMRatio } from '@/analytics/quality';
import { getSetROMChange, computeVBTSetFatigueIndex } from '@/analytics/fatigue';
import { romBreakdownTone, getSetWorkingROM } from '@/analytics/fatigue-verdict';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Fixture
// =============================================================================

/** Concentric ROM per rep, in whatever position unit the scale factor implies. */
const REP_ROMS = [0.62, 0.6, 0.58, 0.52, 0.44];

/** Reference/expected ROM a caller would supply alongside the samples. */
const EXPECTED_ROM = 0.6;

function buildSet(scale: number): Set {
  let set = createSet();
  let seq = 0;
  let t = 1000;

  for (const rom of REP_ROMS) {
    const samples: WorkoutSample[] = [
      {
        sequence: seq,
        timestamp: t,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.6,
        force: 100,
      },
      {
        sequence: seq + 1,
        timestamp: t + 600,
        phase: MovementPhase.CONCENTRIC,
        position: rom * scale,
        velocity: 0.55,
        force: 100,
      },
      {
        sequence: seq + 2,
        timestamp: t + 700,
        phase: MovementPhase.ECCENTRIC,
        position: rom * scale,
        velocity: 0.3,
        force: 80,
      },
      {
        sequence: seq + 3,
        timestamp: t + 1700,
        phase: MovementPhase.ECCENTRIC,
        position: 0,
        velocity: 0.3,
        force: 80,
      },
    ];
    for (const sample of samples) set = addSampleToSet(set, sample);
    seq += 4;
    t += 3200;
  }

  return set;
}

const SCALES = [0.001, 1, 1000];

// =============================================================================
// Scale-invariant (ratio) outputs
// =============================================================================

describe('position scale invariance', () => {
  const baseline = buildSet(1);

  // Guard against a vacuous suite: the fixture must actually exercise the
  // decaying-ROM path, or "unchanged across scales" would hold trivially.
  it('the fixture set has decaying ROM and raises a non-ok ROM tone', () => {
    expect(computeVBTSetFatigueIndex(baseline).romRatio).toBeGreaterThan(0);
    expect(romBreakdownTone(baseline)).not.toBe('ok');
  });

  it.each(SCALES)('getRepROMRatio is unchanged at scale %f', (scale) => {
    const set = buildSet(scale);

    set.reps.forEach((rep, i) => {
      // The caller-supplied reference must move with the samples — that is the
      // stated precondition, not an exemption from it.
      expect(getRepROMRatio(rep, EXPECTED_ROM * scale)).toBeCloseTo(
        getRepROMRatio(baseline.reps[i]!, EXPECTED_ROM),
        10
      );
    });
  });

  it.each(SCALES)('getSetROMChange().percentChange is unchanged at scale %f', (scale) => {
    expect(getSetROMChange(buildSet(scale)).percentChange).toBeCloseTo(
      getSetROMChange(baseline).percentChange,
      10
    );
  });

  it.each(SCALES)('computeVBTSetFatigueIndex().romRatio is unchanged at scale %f', (scale) => {
    expect(computeVBTSetFatigueIndex(buildSet(scale)).romRatio!).toBeCloseTo(
      computeVBTSetFatigueIndex(baseline).romRatio!,
      10
    );
  });

  it.each(SCALES)('romBreakdownTone is unchanged at scale %f', (scale) => {
    expect(romBreakdownTone(buildSet(scale))).toBe(romBreakdownTone(baseline));
  });

  // =============================================================================
  // Scale-DEPENDENT (absolute) outputs — the other half of the claim
  // =============================================================================

  it.each(SCALES)('getRepRangeOfMotion scales linearly by %f', (scale) => {
    const set = buildSet(scale);

    set.reps.forEach((rep, i) => {
      expect(getRepRangeOfMotion(rep)).toBeCloseTo(
        getRepRangeOfMotion(baseline.reps[i]!) * scale,
        10
      );
    });
  });

  it.each(SCALES)('getSetWorkingROM scales linearly by %f', (scale) => {
    expect(getSetWorkingROM(buildSet(scale))!).toBeCloseTo(getSetWorkingROM(baseline)! * scale, 10);
  });
});
