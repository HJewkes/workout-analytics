/**
 * Intra-Set Expected Velocity Strategy Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_FIRST_N_REPS,
  computeExpectedFromFirstNReps,
  createFirstNRepsStrategy,
  type IntraSetExpectedVelocityStrategy,
} from '@/vbt/expected-velocity-intra-set';
import type { Set } from '@/models/set';
import type { Rep } from '@/models/rep';
import { EMPTY_PHASE } from '@/models/phase';

// =============================================================================
// Test helpers
// =============================================================================

/** Build a Rep with the given concentric peak velocity. */
function makeRep(peakVelocity: number, repNumber = 1): Rep {
  return {
    repNumber,
    concentric: { ...EMPTY_PHASE, peakVelocity },
    eccentric: EMPTY_PHASE,
  };
}

/** Build a minimal Set with the given per-rep peak velocities. */
function makeSet(peakVelocities: number[]): Set {
  return {
    reps: peakVelocities.map((v, i) => makeRep(v, i + 1)),
  };
}

// =============================================================================
// Default constant
// =============================================================================

describe('DEFAULT_FIRST_N_REPS', () => {
  it('equals 2 (matching v0 default)', () => {
    expect(DEFAULT_FIRST_N_REPS).toBe(2);
  });
});

// =============================================================================
// computeExpectedFromFirstNReps (pure function)
// =============================================================================

describe('computeExpectedFromFirstNReps', () => {
  it('returns null for an empty set', () => {
    expect(computeExpectedFromFirstNReps(makeSet([]))).toBeNull();
  });

  it('returns an estimate after 1 rep when N=1', () => {
    const result = computeExpectedFromFirstNReps(makeSet([1.0]), 1);
    expect(result).not.toBeNull();
    expect(result!.meanPeakVelocity).toBeCloseTo(1.0);
  });

  it('returns reduced confidence when set has fewer reps than N', () => {
    // 1 rep but N=2 → partial sample
    const result = computeExpectedFromFirstNReps(makeSet([1.0]), 2);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(0.5);
  });

  it('returns full confidence when set has exactly N reps', () => {
    const result = computeExpectedFromFirstNReps(makeSet([1.0, 0.9]), 2);
    expect(result!.confidence).toBe(0.8);
  });

  it('returns mean of FIRST N reps when set has more than N reps', () => {
    // First 2 reps: 1.0 + 0.9 = mean 0.95; later reps should not affect result
    const result = computeExpectedFromFirstNReps(makeSet([1.0, 0.9, 0.7, 0.6]), 2);
    expect(result!.meanPeakVelocity).toBeCloseTo(0.95);
  });

  it('uses default N=2 when n is omitted', () => {
    const result = computeExpectedFromFirstNReps(makeSet([1.0, 0.8, 0.6]));
    expect(result!.meanPeakVelocity).toBeCloseTo(0.9); // (1.0 + 0.8) / 2
  });

  it('tags source as "first-n-reps"', () => {
    const result = computeExpectedFromFirstNReps(makeSet([1.0, 0.9]));
    expect(result!.source).toBe('first-n-reps');
  });
});

// =============================================================================
// createFirstNRepsStrategy — initial state
// =============================================================================

describe('createFirstNRepsStrategy — initial state', () => {
  let strategy: IntraSetExpectedVelocityStrategy;

  beforeEach(() => {
    strategy = createFirstNRepsStrategy();
  });

  it('getExpectedVelocity() returns null before any rep is recorded', () => {
    expect(strategy.getExpectedVelocity()).toBeNull();
  });

  it('getCurrentVelocityLossPct() returns null before any rep is recorded', () => {
    expect(strategy.getCurrentVelocityLossPct()).toBeNull();
  });
});

// =============================================================================
// createFirstNRepsStrategy — baseline accumulation (default N=2)
// =============================================================================

describe('createFirstNRepsStrategy — baseline accumulation with default N=2', () => {
  let strategy: IntraSetExpectedVelocityStrategy;

  beforeEach(() => {
    strategy = createFirstNRepsStrategy(); // firstNReps = 2
  });

  it('getExpectedVelocity() returns null after only 1 rep (< N)', () => {
    strategy.recordRep(1.0);
    expect(strategy.getExpectedVelocity()).toBeNull();
  });

  it('getExpectedVelocity() returns mean of first 2 reps after 2 reps recorded', () => {
    strategy.recordRep(1.0);
    strategy.recordRep(0.9);
    expect(strategy.getExpectedVelocity()).toBeCloseTo(0.95);
  });

  it('getExpectedVelocity() is stable after more reps are recorded (first-N only)', () => {
    strategy.recordRep(1.0);
    strategy.recordRep(0.9);
    strategy.recordRep(0.7); // rep 3 — must NOT change the baseline
    strategy.recordRep(0.6); // rep 4
    expect(strategy.getExpectedVelocity()).toBeCloseTo(0.95);
  });
});

// =============================================================================
// createFirstNRepsStrategy — velocity loss computation
// =============================================================================

describe('createFirstNRepsStrategy — getCurrentVelocityLossPct', () => {
  it('returns null while still within baseline window', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(1.0);
    strategy.recordRep(0.9); // This is rep 2, the last baseline rep — no loss yet
    expect(strategy.getCurrentVelocityLossPct()).toBeNull();
  });

  it('computes 20% loss on rep 3 when baseline=1.0 and rep3 peak=0.8', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(1.0);
    strategy.recordRep(1.0); // baseline mean = 1.0
    strategy.recordRep(0.8); // rep 3: loss = (1.0 - 0.8) / 1.0 * 100 = 20
    expect(strategy.getCurrentVelocityLossPct()).toBeCloseTo(20);
  });

  it('reports 0% loss when rep matches baseline exactly', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(1.0);
    strategy.recordRep(1.0);
    strategy.recordRep(1.0);
    expect(strategy.getCurrentVelocityLossPct()).toBeCloseTo(0);
  });

  it('reports negative loss (velocity gain) when rep exceeds baseline', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(0.8);
    strategy.recordRep(0.8); // baseline = 0.8
    strategy.recordRep(1.0); // faster than baseline
    const loss = strategy.getCurrentVelocityLossPct();
    expect(loss).not.toBeNull();
    expect(loss!).toBeLessThan(0);
  });
});

// =============================================================================
// createFirstNRepsStrategy — reset
// =============================================================================

describe('createFirstNRepsStrategy — reset', () => {
  it('clears all state so getExpectedVelocity() returns null again', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(1.0);
    strategy.recordRep(0.9);
    strategy.reset();
    expect(strategy.getExpectedVelocity()).toBeNull();
  });

  it('clears loss state so getCurrentVelocityLossPct() returns null again', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(1.0);
    strategy.recordRep(1.0);
    strategy.recordRep(0.7);
    strategy.reset();
    expect(strategy.getCurrentVelocityLossPct()).toBeNull();
  });

  it('allows a new baseline to be formed after reset', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(1.0);
    strategy.recordRep(1.0);
    strategy.reset();
    strategy.recordRep(0.5);
    strategy.recordRep(0.5);
    expect(strategy.getExpectedVelocity()).toBeCloseTo(0.5);
  });
});

// =============================================================================
// createFirstNRepsStrategy — custom firstNReps
// =============================================================================

describe('createFirstNRepsStrategy — custom firstNReps', () => {
  it('returns expected velocity after just 1 rep when firstNReps=1', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 1 });
    strategy.recordRep(1.2);
    expect(strategy.getExpectedVelocity()).toBeCloseTo(1.2);
  });

  it('returns null until 3 reps recorded when firstNReps=3', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 3 });
    strategy.recordRep(1.0);
    strategy.recordRep(0.9);
    expect(strategy.getExpectedVelocity()).toBeNull();
    strategy.recordRep(0.8);
    expect(strategy.getExpectedVelocity()).toBeCloseTo((1.0 + 0.9 + 0.8) / 3);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('createFirstNRepsStrategy — edge cases', () => {
  it('does not divide by zero when rep velocity is 0 (zero-baseline edge)', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 2 });
    strategy.recordRep(0);
    strategy.recordRep(0); // baseline mean = 0
    strategy.recordRep(0); // rep 3
    // Expected = 0; loss pct should be 0 (not NaN / Infinity)
    expect(strategy.getCurrentVelocityLossPct()).toBe(0);
  });

  it('handles a single rep when firstNReps=1 without computing negative loss on that rep', () => {
    const strategy = createFirstNRepsStrategy({ firstNReps: 1 });
    strategy.recordRep(1.0);
    // Rep 1 IS the baseline — no "loss" yet
    expect(strategy.getCurrentVelocityLossPct()).toBeNull();
  });
});
