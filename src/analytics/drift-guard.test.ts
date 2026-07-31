/**
 * Drift Guard Tests — execution-comparability gate (VW-90 / B15).
 */

import { describe, it, expect } from 'vitest';
import {
  summarizeSetsForDrift,
  evaluateDriftGuard,
  DRIFT_GUARD_THRESHOLDS,
  type DriftSummary,
} from '@/analytics/drift-guard';
import { computeChange } from '@/analytics/types';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Test Helpers
// =============================================================================

/** Samples for one rep with an explicit concentric duration and ROM. */
function repSamples(
  startSeq: number,
  startTime: number,
  romM: number,
  conTimeMs: number
): WorkoutSample[] {
  return [
    {
      sequence: startSeq,
      timestamp: startTime,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity: 0.5,
      force: 100,
    },
    {
      sequence: startSeq + 1,
      timestamp: startTime + conTimeMs,
      phase: MovementPhase.CONCENTRIC,
      position: romM,
      velocity: 0.5,
      force: 100,
    },
    {
      sequence: startSeq + 2,
      timestamp: startTime + conTimeMs + 100,
      phase: MovementPhase.ECCENTRIC,
      position: romM,
      velocity: -0.3,
      force: 80,
    },
    {
      sequence: startSeq + 3,
      timestamp: startTime + conTimeMs + 1600,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: -0.3,
      force: 80,
    },
  ];
}

/** A set of `repCount` identical reps at the given ROM and concentric time. */
function buildSet(repCount: number, romM: number, conTimeMs: number): Set {
  let set = createSet();
  for (let i = 0; i < repCount; i++) {
    for (const sample of repSamples(i * 4, 1000 + i * 10_000, romM, conTimeMs)) {
      set = addSampleToSet(set, sample);
    }
  }
  return set;
}

/** A summary built directly, for evaluation tests that don't need real reps. */
function summary(tempoS: number, romM: number, repCount = 8): DriftSummary {
  return { medianConcentricTempoS: tempoS, medianRomM: romM, repCount };
}

const BASELINE = summary(1.0, 0.5);

// =============================================================================
// summarizeSetsForDrift
// =============================================================================

describe('summarizeSetsForDrift', () => {
  it('takes medians of concentric time and ROM across every rep in every set', () => {
    // Arrange: two sets, 3 reps each, all 1.0 s / 0.50 m
    const sets = [buildSet(3, 0.5, 1000), buildSet(3, 0.5, 1000)];

    // Act
    const result = summarizeSetsForDrift(sets);

    // Assert
    expect(result).toEqual({
      medianConcentricTempoS: 1,
      medianRomM: 0.5,
      repCount: 6,
    });
  });

  it('uses the median, so a single mis-segmented rep does not move the read', () => {
    // Arrange: four normal reps plus one absurd 9 s rep
    const sets = [buildSet(4, 0.5, 1000), buildSet(1, 0.5, 9000)];

    // Act
    const result = summarizeSetsForDrift(sets);

    // Assert: median stays at the normal cadence (a mean would be ~2.6 s)
    expect(result?.medianConcentricTempoS).toBe(1);
    expect(result?.repCount).toBe(5);
  });

  it('returns undefined when no rep qualifies', () => {
    // Arrange: an empty set has no reps at all
    const sets = [createSet()];

    // Act
    const result = summarizeSetsForDrift(sets);

    // Assert
    expect(result).toBeUndefined();
  });

  it('excludes zero-ROM reps rather than folding a 0 into the median', () => {
    // Arrange: three real reps plus one rep that never moved (ROM 0)
    const sets = [buildSet(3, 0.5, 1000), buildSet(1, 0, 1000)];

    // Act
    const result = summarizeSetsForDrift(sets);

    // Assert
    expect(result?.repCount).toBe(3);
    expect(result?.medianRomM).toBe(0.5);
  });
});

// =============================================================================
// evaluateDriftGuard
// =============================================================================

describe('evaluateDriftGuard', () => {
  it('is comparable and unflagged when execution did not move', () => {
    // Arrange
    const current = summary(1.0, 0.5);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current);

    // Assert
    expect(verdict.comparable).toBe(true);
    expect(verdict.flagged).toBe(false);
    expect(verdict.tempoDriftPct).toBe(0);
    expect(verdict.romDriftPct).toBe(0);
    expect(verdict.thresholdsUsed).toEqual({ tempoDriftPct: 15, romDriftPct: 15 });
  });

  it('stays unflagged for drift just under the hard threshold', () => {
    // Arrange: +14 % tempo, −14 % ROM
    const current = summary(1.14, 0.43);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current);

    // Assert
    expect(verdict.comparable).toBe(true);
    expect(verdict.flagged).toBe(false);
    expect(verdict.tempoDriftPct).toBeCloseTo(14, 5);
    expect(verdict.romDriftPct).toBeCloseTo(-14, 5);
  });

  it('flags but still allows drift inside the soft band', () => {
    // Arrange: +20 % tempo — past 15 %, inside 22.5 %
    const current = summary(1.2, 0.5);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current);

    // Assert
    expect(verdict.comparable).toBe(true);
    expect(verdict.flagged).toBe(true);
    expect(verdict.reasoning).toContain('tempo');
    expect(verdict.reasoning).toContain('+20.0%');
  });

  it('refuses comparison once drift clears the flagged band', () => {
    // Arrange: −30 % ROM — well past 22.5 %
    const current = summary(1.0, 0.35);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current);

    // Assert
    expect(verdict.comparable).toBe(false);
    expect(verdict.flagged).toBe(true);
    expect(verdict.reasoning).toContain('ROM');
    expect(verdict.reasoning).toContain('-30.0%');
  });

  it('names only the metric that drifted when the other is stable', () => {
    // Arrange: ROM collapses, tempo unchanged
    const current = summary(1.0, 0.38);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current);

    // Assert
    expect(verdict.reasoning).toContain('ROM');
    expect(verdict.reasoning).not.toContain('tempo');
    expect(verdict.tempoDriftPct).toBe(0);
  });

  it('names both metrics when both drifted', () => {
    // Arrange
    const current = summary(1.3, 0.35);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current);

    // Assert
    expect(verdict.reasoning).toContain('tempo');
    expect(verdict.reasoning).toContain('ROM');
    expect(verdict.comparable).toBe(false);
  });

  it('flags but never blocks when either side has too few reps', () => {
    // Arrange: huge drift, but the current side has 3 reps (below the floor of 4)
    const thin = summary(2.0, 0.2, DRIFT_GUARD_THRESHOLDS.minRepsForConfidentRead - 1);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, thin);

    // Assert: a drift number from 3 reps caveats a verdict, it does not delete one
    expect(verdict.comparable).toBe(true);
    expect(verdict.flagged).toBe(true);
    expect(verdict.reasoning).toBe('insufficient reps for a reliable drift read');
    expect(verdict.tempoDriftPct).toBeCloseTo(100, 5);
  });

  it('applies the rep floor to the baseline side as well', () => {
    // Arrange
    const thinBaseline = summary(1.0, 0.5, 2);

    // Act
    const verdict = evaluateDriftGuard(thinBaseline, summary(1.0, 0.5));

    // Assert
    expect(verdict.flagged).toBe(true);
    expect(verdict.reasoning).toBe('insufficient reps for a reliable drift read');
  });

  it('honours caller-supplied thresholds and reports them back', () => {
    // Arrange: +20 % tempo, but the caller tolerates 25 %
    const current = summary(1.2, 0.5);

    // Act
    const verdict = evaluateDriftGuard(BASELINE, current, {
      tempoDriftPct: 25,
      romDriftPct: 25,
    });

    // Assert
    expect(verdict.flagged).toBe(false);
    expect(verdict.thresholdsUsed).toEqual({ tempoDriftPct: 25, romDriftPct: 25 });
  });

  it('reports 0 % rather than Infinity when a baseline metric is zero', () => {
    // Arrange: computeChange already guards first === 0
    expect(computeChange(0, 1.2).percentChange).toBe(0);
    const zeroBaseline = summary(0, 0);

    // Act
    const verdict = evaluateDriftGuard(zeroBaseline, summary(1.2, 0.6));

    // Assert: an unmeasurable baseline reads as no drift, never NaN/Infinity
    expect(verdict.tempoDriftPct).toBe(0);
    expect(verdict.romDriftPct).toBe(0);
    expect(verdict.comparable).toBe(true);
    expect(verdict.flagged).toBe(false);
  });
});

// =============================================================================
// End-to-end: real sets through both stages
// =============================================================================

describe('drift guard end to end', () => {
  it('blocks a session where the lifter cut ROM by a third', () => {
    // Arrange
    const baseline = summarizeSetsForDrift([buildSet(6, 0.6, 1000)]);
    const current = summarizeSetsForDrift([buildSet(6, 0.4, 1000)]);

    // Act
    const verdict = evaluateDriftGuard(baseline!, current!);

    // Assert
    expect(verdict.comparable).toBe(false);
    expect(verdict.romDriftPct).toBeCloseTo(-33.33, 1);
  });
});
