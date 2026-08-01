/**
 * MRV Underperformance Tests — two-session underperformance detector
 * (VW-91 / B04).
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeSetsForPerformance,
  evaluateMrvUnderperformance,
  evaluateMrvGuard,
  type PerformanceSummary,
  type MrvUnderperformanceVerdict,
  type WeightedSet,
} from '@/analytics/mrv-underperformance';
import type { DriftGuardVerdict } from '@/analytics/drift-guard';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';

// =============================================================================
// Test Helpers
// =============================================================================

/** Samples for one rep moving at an explicit concentric velocity. */
function repSamples(startSeq: number, startTime: number, velocityMps: number): WorkoutSample[] {
  return [
    {
      sequence: startSeq,
      timestamp: startTime,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity: velocityMps,
      force: 100,
    },
    {
      sequence: startSeq + 1,
      timestamp: startTime + 1000,
      phase: MovementPhase.CONCENTRIC,
      position: 0.5,
      velocity: velocityMps,
      force: 100,
    },
    {
      sequence: startSeq + 2,
      timestamp: startTime + 1100,
      phase: MovementPhase.ECCENTRIC,
      position: 0.5,
      velocity: -0.3,
      force: 80,
    },
    {
      sequence: startSeq + 3,
      timestamp: startTime + 2600,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: -0.3,
      force: 80,
    },
  ];
}

/** A set of `repCount` identical reps at the given load and velocity. */
function buildSet(repCount: number, weightLbs: number | undefined, velocityMps = 0.5): WeightedSet {
  let set = createSet();
  for (let i = 0; i < repCount; i++) {
    for (const sample of repSamples(i * 4, 1000 + i * 10_000, velocityMps)) {
      set = addSampleToSet(set, sample);
    }
  }
  return weightLbs === undefined ? set : { ...set, weightLbs };
}

/** A summary built directly, for evaluation tests that don't need real reps. */
function summary(overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    medianSetWeightLbs: 100,
    totalVolumeLoadLbs: 2500,
    medianConcentricVelocityMps: 0.5,
    workingSetCount: 5,
    totalReps: 25,
    ...overrides,
  };
}

/** A drift verdict built directly. Comparable and unflagged unless overridden. */
function drift(overrides: Partial<DriftGuardVerdict> = {}): DriftGuardVerdict {
  return {
    comparable: true,
    flagged: false,
    tempoDriftPct: 0,
    romDriftPct: 0,
    reasoning: 'tempo and ROM within tolerance',
    thresholdsUsed: { tempoDriftPct: 15, romDriftPct: 15 },
    ...overrides,
  };
}

const BASELINE = summary();

/** A pairwise verdict built directly, for combinator tests. */
function pair(
  evaluable: boolean,
  underperformed: boolean,
  reasoning = 'reason'
): MrvUnderperformanceVerdict {
  return {
    evaluable,
    underperformed,
    volumeLoadDeltaPct: underperformed ? -20 : 0,
    velocityDeltaPct: 0,
    reasoning,
    thresholdsUsed: {
      volumeLoadDeclinePct: 10,
      velocityDeclinePct: 10,
      loadToleranceLbs: 2.5,
    },
  };
}

// =============================================================================
// summarizeSetsForPerformance
// =============================================================================

describe('summarizeSetsForPerformance', () => {
  it('returns undefined when no set qualifies', () => {
    // Arrange: one set with no load recorded, one with load but no reps
    const sets = [buildSet(5, undefined), buildSet(0, 100)];

    // Act
    const result = summarizeSetsForPerformance(sets);

    // Assert
    expect(result).toBeUndefined();
  });

  it('excludes sets missing weightLbs rather than counting them as zero load', () => {
    // Arrange: 3 reps @ 100 lbs, plus 10 reps at an unrecorded load
    const sets = [buildSet(3, 100), buildSet(10, undefined)];

    // Act
    const result = summarizeSetsForPerformance(sets);

    // Assert: the unloaded-unknown set contributes nothing at all
    expect(result?.workingSetCount).toBe(1);
    expect(result?.totalReps).toBe(3);
    expect(result?.totalVolumeLoadLbs).toBe(300);
  });

  it('computes median load, volume load and rep count across qualifying sets', () => {
    // Arrange: 5×100, 5×110, 5×120
    const sets = [buildSet(5, 100), buildSet(5, 110), buildSet(5, 120)];

    // Act
    const result = summarizeSetsForPerformance(sets);

    // Assert
    expect(result).toMatchObject({
      medianSetWeightLbs: 110,
      totalVolumeLoadLbs: 500 + 550 + 600,
      workingSetCount: 3,
      totalReps: 15,
    });
    expect(result?.medianConcentricVelocityMps).toBeCloseTo(0.5, 5);
  });

  it('takes the median velocity, so one slow set does not move the read', () => {
    // Arrange: four reps at 0.5 m/s, one absurdly slow rep
    const sets = [buildSet(4, 100, 0.5), buildSet(1, 100, 0.05)];

    // Act
    const result = summarizeSetsForPerformance(sets);

    // Assert: a mean would land near 0.41
    expect(result?.medianConcentricVelocityMps).toBeCloseTo(0.5, 5);
  });

  it('excludes non-positive-velocity reps rather than folding a 0 into the median', () => {
    // Arrange: three measured reps plus three that registered no movement —
    // enough unmeasured reps that folding them in would halve the median.
    const sets = [buildSet(3, 100, 0.4), buildSet(3, 100, 0)];

    // Act
    const result = summarizeSetsForPerformance(sets);

    // Assert: the unmeasured reps still count as work, just not as velocity
    expect(result?.medianConcentricVelocityMps).toBeCloseTo(0.4, 5);
    expect(result?.totalReps).toBe(6);
  });

  it('reports zero velocity when nothing was measurable, not undefined', () => {
    // Arrange
    const sets = [buildSet(3, 100, 0)];

    // Act
    const result = summarizeSetsForPerformance(sets);

    // Assert
    expect(result?.medianConcentricVelocityMps).toBe(0);
    expect(result?.workingSetCount).toBe(1);
  });
});

// =============================================================================
// evaluateMrvUnderperformance
// =============================================================================

describe('evaluateMrvUnderperformance', () => {
  it('refuses to evaluate when the drift guard says not comparable, however bad the numbers look', () => {
    // Arrange: volume load halved at matched load — an unmistakable decline —
    // but the two sessions describe different movements.
    const current = summary({ totalVolumeLoadLbs: 1250, medianConcentricVelocityMps: 0.25 });
    const blocked = drift({
      comparable: false,
      flagged: true,
      reasoning: 'ROM drifted -30.0% (limit 22.5%) — execution is too different to compare',
    });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, blocked);

    // Assert: the gate wins outright; no performance number is even reported
    expect(verdict.evaluable).toBe(false);
    expect(verdict.underperformed).toBe(false);
    expect(verdict.volumeLoadDeltaPct).toBe(0);
    expect(verdict.velocityDeltaPct).toBe(0);
    expect(verdict.reasoning).toContain('ROM drifted -30.0%');
  });

  it('refuses to evaluate when median load dropped past tolerance', () => {
    // Arrange: 20 lbs lighter and 20 % less volume load — expected, not a signal
    const current = summary({ medianSetWeightLbs: 80, totalVolumeLoadLbs: 2000 });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift());

    // Assert
    expect(verdict.evaluable).toBe(false);
    expect(verdict.underperformed).toBe(false);
    expect(verdict.reasoning).toContain('median load dropped');
  });

  it('still evaluates when load slipped less than the tolerance', () => {
    // Arrange: 2 lbs lighter — inside the 2.5 lb tolerance
    const current = summary({ medianSetWeightLbs: 98, totalVolumeLoadLbs: 2000 });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift());

    // Assert
    expect(verdict.evaluable).toBe(true);
    expect(verdict.underperformed).toBe(true);
  });

  it('flags underperformance on a volume-load decline past the threshold', () => {
    // Arrange: −20 % volume load at the same weight
    const current = summary({ totalVolumeLoadLbs: 2000 });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift());

    // Assert
    expect(verdict.evaluable).toBe(true);
    expect(verdict.underperformed).toBe(true);
    expect(verdict.volumeLoadDeltaPct).toBeCloseTo(-20, 5);
    expect(verdict.reasoning).toContain('volume load');
    expect(verdict.caveat).toBeUndefined();
  });

  it('flags underperformance on a velocity decline even when volume held', () => {
    // Arrange: same volume load, −20 % concentric velocity
    const current = summary({ medianConcentricVelocityMps: 0.4 });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift());

    // Assert
    expect(verdict.underperformed).toBe(true);
    expect(verdict.reasoning).toContain('concentric velocity');
    expect(verdict.reasoning).not.toContain('volume load');
  });

  it('does not flag a decline that stayed under the threshold', () => {
    // Arrange: −5 % volume load, −5 % velocity
    const current = summary({ totalVolumeLoadLbs: 2375, medianConcentricVelocityMps: 0.475 });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift());

    // Assert
    expect(verdict.evaluable).toBe(true);
    expect(verdict.underperformed).toBe(false);
    expect(verdict.volumeLoadDeltaPct).toBeCloseTo(-5, 5);
  });

  it('does not flag a session that improved at heavier load', () => {
    // Arrange
    const current = summary({
      medianSetWeightLbs: 110,
      totalVolumeLoadLbs: 3000,
      medianConcentricVelocityMps: 0.55,
    });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift());

    // Assert
    expect(verdict.underperformed).toBe(false);
    expect(verdict.volumeLoadDeltaPct).toBeCloseTo(20, 5);
  });

  it('propagates the drift reasoning as a caveat when the pair was flagged but comparable', () => {
    // Arrange
    const flagged = drift({
      flagged: true,
      reasoning: 'tempo drifted +20.0% (limit 15%) — comparable, but treat the result as a caveat',
    });

    // Act
    const verdict = evaluateMrvUnderperformance(
      BASELINE,
      summary({ totalVolumeLoadLbs: 2000 }),
      flagged
    );

    // Assert
    expect(verdict.evaluable).toBe(true);
    expect(verdict.underperformed).toBe(true);
    expect(verdict.caveat).toBe(flagged.reasoning);
  });

  it('honours caller-supplied thresholds and reports them back', () => {
    // Arrange: −20 % volume load, but the caller tolerates 25 %
    const current = summary({ totalVolumeLoadLbs: 2000 });

    // Act
    const verdict = evaluateMrvUnderperformance(BASELINE, current, drift(), {
      volumeLoadDeclinePct: 25,
      velocityDeclinePct: 25,
    });

    // Assert
    expect(verdict.underperformed).toBe(false);
    expect(verdict.thresholdsUsed).toEqual({
      volumeLoadDeclinePct: 25,
      velocityDeclinePct: 25,
      loadToleranceLbs: 2.5,
    });
  });

  it('reports 0 % rather than Infinity when a baseline metric is zero', () => {
    // Arrange: a baseline with no measurable velocity
    const baseline = summary({ medianConcentricVelocityMps: 0 });

    // Act
    const verdict = evaluateMrvUnderperformance(baseline, summary(), drift());

    // Assert
    expect(verdict.velocityDeltaPct).toBe(0);
    expect(verdict.underperformed).toBe(false);
  });
});

// =============================================================================
// evaluateMrvGuard
// =============================================================================

describe('evaluateMrvGuard', () => {
  it('flags when both consecutive sessions underperformed', () => {
    // Arrange
    const verdict = evaluateMrvGuard(
      pair(true, true, 'prior drop'),
      pair(true, true, 'current drop')
    );

    // Assert
    expect(verdict.mrvFlagged).toBe(true);
    expect(verdict.reasoning).toContain('prior drop');
    expect(verdict.reasoning).toContain('current drop');
  });

  it('does not flag when only the current session underperformed', () => {
    // Arrange / Act
    const verdict = evaluateMrvGuard(pair(true, false), pair(true, true));

    // Assert
    expect(verdict.mrvFlagged).toBe(false);
    expect(verdict.reasoning).toContain('only one');
  });

  it('does not flag when only the prior session underperformed', () => {
    // Arrange / Act
    const verdict = evaluateMrvGuard(pair(true, true), pair(true, false));

    // Assert
    expect(verdict.mrvFlagged).toBe(false);
  });

  it('does not flag when neither session underperformed', () => {
    // Arrange / Act
    const verdict = evaluateMrvGuard(pair(true, false), pair(true, false));

    // Assert
    expect(verdict.mrvFlagged).toBe(false);
    expect(verdict.reasoning).toBe('neither session underperformed');
  });

  it('says inconclusive — not "fine" — when a pair could not be evaluated', () => {
    // Arrange: the prior pair was gated out despite the current one dropping
    const verdict = evaluateMrvGuard(pair(false, false, 'drift guard refused'), pair(true, true));

    // Assert
    expect(verdict.mrvFlagged).toBe(false);
    expect(verdict.reasoning).toContain('inconclusive');
    expect(verdict.reasoning).toContain('prior pair');
    expect(verdict.reasoning).toContain('drift guard refused');
  });

  it('names both sides when neither pair could be evaluated', () => {
    // Arrange / Act
    const verdict = evaluateMrvGuard(pair(false, false), pair(false, false));

    // Assert
    expect(verdict.reasoning).toContain('prior pair');
    expect(verdict.reasoning).toContain('current pair');
  });
});
