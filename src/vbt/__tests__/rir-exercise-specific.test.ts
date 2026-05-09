/**
 * Exercise-Specific RIR Estimation Tests
 */

import { describe, it, expect } from 'vitest';
import {
  estimateRIRWithProfile,
  DEFAULT_CABLE_COMPOUND_PROFILE,
  DEFAULT_CABLE_ISOLATION_PROFILE,
  DEFAULT_FALLBACK_PROFILE,
  type RIREstimateInputs,
  type ExerciseVBTProfile,
} from '@/vbt/rir-exercise-specific';
// Note: ExerciseRIREstimate (not RIREstimate) — avoids confusion with analytics/fatigue RIREstimate

// =============================================================================
// Test Data
// =============================================================================

/** Fresh rep — high velocity relative to baseline, low fatigue, early in set. */
const FRESH_INPUTS: RIREstimateInputs = {
  peakVelocity: 1.0,
  baselineMaxVelocity: 1.0, // vRatio = 1.0
  velLossPct: 5,
  repIndex: 1,
  repsInSet: 8,
};

/** Fatigued rep — slow relative to baseline, high loss, late in set. */
const FATIGUED_INPUTS: RIREstimateInputs = {
  peakVelocity: 0.4,
  baselineMaxVelocity: 1.0, // vRatio = 0.4
  velLossPct: 55,
  repIndex: 8,
  repsInSet: 8,
};

/** In-calibration-window inputs (should yield 'high' confidence). */
const HIGH_CONF_INPUTS: RIREstimateInputs = {
  peakVelocity: 0.7,
  baselineMaxVelocity: 1.0, // vRatio = 0.7
  velLossPct: 25,
  repIndex: 4,
  repsInSet: 8,
};

/** Far-out inputs (should yield 'low' confidence). */
const LOW_CONF_INPUTS: RIREstimateInputs = {
  peakVelocity: 0.2,
  baselineMaxVelocity: 1.0, // vRatio = 0.2 — below outer window
  velLossPct: 80,            // above outer window
  repIndex: 1,
  repsInSet: 8,
};

// =============================================================================
// Default Profile Constants
// =============================================================================

describe('default profiles', () => {
  it('DEFAULT_CABLE_COMPOUND_PROFILE is defined with required fields', () => {
    expect(DEFAULT_CABLE_COMPOUND_PROFILE.exerciseTypeId).toBe('cable-compound');
    expect(DEFAULT_CABLE_COMPOUND_PROFILE.coefficients).toMatchObject({
      c0: expect.any(Number),
      c1: expect.any(Number),
      c2: expect.any(Number),
      c3: expect.any(Number),
    });
  });

  it('DEFAULT_CABLE_ISOLATION_PROFILE is defined with required fields', () => {
    expect(DEFAULT_CABLE_ISOLATION_PROFILE.exerciseTypeId).toBe('cable-isolation');
    expect(DEFAULT_CABLE_ISOLATION_PROFILE.coefficients).toMatchObject({
      c0: expect.any(Number),
      c1: expect.any(Number),
      c2: expect.any(Number),
      c3: expect.any(Number),
    });
  });

  it('DEFAULT_FALLBACK_PROFILE is the isolation profile', () => {
    expect(DEFAULT_FALLBACK_PROFILE).toBe(DEFAULT_CABLE_ISOLATION_PROFILE);
  });
});

// =============================================================================
// estimateRIRWithProfile — Core behaviour
// =============================================================================

describe('estimateRIRWithProfile — RIR shape', () => {
  it('returns higher RIR for fresh inputs than fatigued inputs', () => {
    const fresh = estimateRIRWithProfile(FRESH_INPUTS, DEFAULT_CABLE_COMPOUND_PROFILE);
    const fatigued = estimateRIRWithProfile(FATIGUED_INPUTS, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect(fresh.rir).toBeGreaterThan(fatigued.rir);
  });

  it('clamps negative regression output to rir=0', () => {
    // Force a very fatigued scenario that will push the linear model below 0
    const veryFatigued: RIREstimateInputs = {
      peakVelocity: 0.1,
      baselineMaxVelocity: 1.0, // vRatio = 0.1
      velLossPct: 90,
      repIndex: 10,
      repsInSet: 10,
    };
    const result = estimateRIRWithProfile(veryFatigued, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect(result.rir).toBeGreaterThanOrEqual(0);
  });

  it('rir is a finite number for all valid inputs', () => {
    const result = estimateRIRWithProfile(FRESH_INPUTS);
    expect(Number.isFinite(result.rir)).toBe(true);
  });
});

// =============================================================================
// estimateRIRWithProfile — Range
// =============================================================================

describe('estimateRIRWithProfile — range', () => {
  it('range.high equals roundHalf(rir + 1.96 * stderr)', () => {
    const profile = DEFAULT_CABLE_COMPOUND_PROFILE;
    const stderr = profile.stderr ?? 0.8;
    const result = estimateRIRWithProfile(HIGH_CONF_INPUTS, profile);

    // Implementation: range.high = roundHalf(rir + halfBand) where halfBand = roundHalf(1.96*stderr)
    const halfBand = Math.round(1.96 * stderr * 2) / 2;           // inner round
    const expectedHigh = Math.round((result.rir + halfBand) * 2) / 2; // outer round
    expect(result.range.high).toBeCloseTo(expectedHigh, 5);
  });

  it('range.low is clamped to >= 0 even when rir is small', () => {
    const almostFail: RIREstimateInputs = {
      peakVelocity: 0.3,
      baselineMaxVelocity: 1.0,
      velLossPct: 50,
      repIndex: 7,
      repsInSet: 8,
    };
    const result = estimateRIRWithProfile(almostFail, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect(result.range.low).toBeGreaterThanOrEqual(0);
  });

  it('range is resolved to half-rep (0.5) steps', () => {
    const result = estimateRIRWithProfile(HIGH_CONF_INPUTS, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect((result.range.low * 2) % 1).toBe(0); // i.e. multiple of 0.5
    expect((result.range.high * 2) % 1).toBe(0);
  });
});

// =============================================================================
// estimateRIRWithProfile — Confidence
// =============================================================================

describe('estimateRIRWithProfile — confidence', () => {
  it('yields "high" confidence for in-window inputs', () => {
    const result = estimateRIRWithProfile(HIGH_CONF_INPUTS, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect(result.confidence).toBe('high');
  });

  it('yields "low" confidence for far-out inputs', () => {
    const result = estimateRIRWithProfile(LOW_CONF_INPUTS, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect(result.confidence).toBe('low');
  });

  it('yields "medium" confidence for mid-window inputs', () => {
    // velLossPct in [5,70] AND vRatio in [0.3,1.1] but outside high window
    const midInputs: RIREstimateInputs = {
      peakVelocity: 0.35,          // vRatio = 0.35 — in medium window, not high
      baselineMaxVelocity: 1.0,
      velLossPct: 60,              // in medium window [5,70], not high [10,50]
      repIndex: 3,
      repsInSet: 8,
    };
    const result = estimateRIRWithProfile(midInputs, DEFAULT_CABLE_COMPOUND_PROFILE);
    expect(result.confidence).toBe('medium');
  });
});

// =============================================================================
// estimateRIRWithProfile — Profile selection
// =============================================================================

describe('estimateRIRWithProfile — profile selection', () => {
  it('uses fallback profile when no profile is passed', () => {
    const withFallback = estimateRIRWithProfile(HIGH_CONF_INPUTS);
    const withExplicit = estimateRIRWithProfile(HIGH_CONF_INPUTS, DEFAULT_FALLBACK_PROFILE);
    expect(withFallback.rir).toBe(withExplicit.rir);
    expect(withFallback.confidence).toBe(withExplicit.confidence);
  });

  it('compound and isolation profiles produce different RIR values', () => {
    const compound = estimateRIRWithProfile(FATIGUED_INPUTS, DEFAULT_CABLE_COMPOUND_PROFILE);
    const isolation = estimateRIRWithProfile(FATIGUED_INPUTS, DEFAULT_CABLE_ISOLATION_PROFILE);
    // Different coefficients must yield different results
    expect(compound.rir).not.toEqual(isolation.rir);
  });

  it('custom profile coefficients are respected', () => {
    const customProfile: ExerciseVBTProfile = {
      exerciseTypeId: 'custom',
      coefficients: { c0: 10, c1: 0, c2: 0, c3: 0 }, // flat: always RIR=10
      stderr: 0.5,
    };
    const result = estimateRIRWithProfile(FATIGUED_INPUTS, customProfile);
    expect(result.rir).toBe(10);
  });
});

// =============================================================================
// estimateRIRWithProfile — Edge cases
// =============================================================================

describe('estimateRIRWithProfile — edge cases', () => {
  it('does not divide-by-zero when baselineMaxVelocity is 0', () => {
    const inputs: RIREstimateInputs = {
      peakVelocity: 0.8,
      baselineMaxVelocity: 0, // would cause division by zero without clamp
      velLossPct: 0,
      repIndex: 1,
      repsInSet: 8,
    };
    expect(() => estimateRIRWithProfile(inputs)).not.toThrow();
    const result = estimateRIRWithProfile(inputs);
    expect(Number.isFinite(result.rir)).toBe(true);
  });

  it('uses repsInSet=8 as default when undefined', () => {
    const withDefault = estimateRIRWithProfile({
      ...HIGH_CONF_INPUTS,
      repsInSet: undefined,
    });
    const withExplicit8 = estimateRIRWithProfile({
      ...HIGH_CONF_INPUTS,
      repsInSet: 8,
    });
    expect(withDefault.rir).toBe(withExplicit8.rir);
  });

  it('uses repsInSet=8 as default when null', () => {
    const withNull = estimateRIRWithProfile({
      ...HIGH_CONF_INPUTS,
      repsInSet: null,
    });
    const withExplicit8 = estimateRIRWithProfile({
      ...HIGH_CONF_INPUTS,
      repsInSet: 8,
    });
    expect(withNull.rir).toBe(withExplicit8.rir);
  });

  it('higher repIndex (later in set) yields lower RIR than earlier rep (all else equal)', () => {
    const earlyRep = estimateRIRWithProfile(
      { ...HIGH_CONF_INPUTS, repIndex: 1 },
      DEFAULT_CABLE_COMPOUND_PROFILE,
    );
    const lateRep = estimateRIRWithProfile(
      { ...HIGH_CONF_INPUTS, repIndex: 7 },
      DEFAULT_CABLE_COMPOUND_PROFILE,
    );
    expect(earlyRep.rir).toBeGreaterThan(lateRep.rir);
  });
});
