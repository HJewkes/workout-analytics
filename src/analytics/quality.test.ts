/**
 * Rep Quality Analytics Tests
 *
 * Tests for second-order rep quality assessment functions.
 */

import { describe, it, expect } from 'vitest';
import {
  assessRepROM,
  assessRepEccentricControl,
  assessRepVelocity,
  getRepQualityFlags,
  isPartialRep,
  isEccentricRushed,
  getRepROMRatio,
  getRepEccentricTimeRatio,
  getRepVelocityRatio,
  assessRepQuality,
  DEFAULT_PARTIAL_REP_SCHEME,
  DEFAULT_ECC_RUSHED_SCHEME,
} from '@/analytics/quality';
import {
  createTechniqueBaseline,
  createFixedExpectation,
  createDistributionExpectation,
} from '@/analytics/types';
import { buildDistribution } from '@/stats/distribution';
import { createBreakpointScheme } from '@/stats/schemes';
import { createRep, addSampleToRep } from '@/models/rep';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Rep } from '@/models/rep';

// =============================================================================
// Test Helpers
// =============================================================================

function buildRep(repNumber: number, samples: WorkoutSample[]): Rep {
  let rep = createRep(repNumber);
  for (const sample of samples) {
    rep = addSampleToRep(rep, sample);
  }
  return rep;
}

/**
 * Create a rep with specified velocity, ROM, and eccentric time.
 */
function createTestRep(velocity: number, rom: number, eccTimeSec: number): Rep {
  const eccTimeMs = eccTimeSec * 1000;
  const samples: WorkoutSample[] = [
    // Concentric: 1 second
    {
      sequence: 0,
      timestamp: 1000,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity,
      force: 100,
    },
    {
      sequence: 1,
      timestamp: 2000,
      phase: MovementPhase.CONCENTRIC,
      position: rom,
      velocity,
      force: 100,
    },
    // Eccentric: specified time
    {
      sequence: 2,
      timestamp: 2500,
      phase: MovementPhase.ECCENTRIC,
      position: rom,
      velocity: velocity * 0.5,
      force: 80,
    },
    {
      sequence: 3,
      timestamp: 2500 + eccTimeMs,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: velocity * 0.5,
      force: 80,
    },
  ];
  return buildRep(1, samples);
}

/**
 * Create a baseline with fixed values.
 */
function createFixedBaseline() {
  return createTechniqueBaseline({
    rom: 1.0,
    eccentricTime: 2.0,
    concentricTime: 1.0,
    meanVelocity: 0.5,
  });
}

/**
 * Create a baseline with distributions.
 */
function createDistributionBaseline() {
  return createTechniqueBaseline({
    rom: buildDistribution([0.95, 1.0, 1.05, 1.0, 0.98]),
    eccentricTime: buildDistribution([1.8, 2.0, 2.2, 2.0, 1.9]),
    concentricTime: buildDistribution([0.9, 1.0, 1.1, 1.0, 0.95]),
    meanVelocity: buildDistribution([0.45, 0.5, 0.55, 0.5, 0.48]),
  });
}

// =============================================================================
// Assessment Function Tests
// =============================================================================

describe('assessRepROM()', () => {
  it('compares ROM against fixed expectation', () => {
    const rep = createTestRep(0.5, 0.9, 2.0);
    const expectation = createFixedExpectation(1.0);
    const result = assessRepROM(rep, expectation);

    expect(result.ratio).toBeCloseTo(0.9, 5);
    expect(result.zScore).toBeNull();
    expect(result.confidence).toBe('low'); // Fixed expectations have low confidence
  });

  it('compares ROM against distribution expectation', () => {
    const rep = createTestRep(0.5, 0.7, 2.0);
    const dist = buildDistribution([0.95, 1.0, 1.05, 1.0, 0.98]);
    const expectation = createDistributionExpectation(dist);
    const result = assessRepROM(rep, expectation);

    expect(result.ratio).toBeLessThan(1);
    expect(result.zScore).not.toBeNull();
    expect(result.zScore!).toBeLessThan(0); // Below mean
  });
});

describe('assessRepEccentricControl()', () => {
  it('compares eccentric time against expectation', () => {
    const rep = createTestRep(0.5, 1.0, 1.0); // 1 second eccentric
    const expectation = createFixedExpectation(2.0); // Expected 2 seconds
    const result = assessRepEccentricControl(rep, expectation);

    expect(result.ratio).toBeCloseTo(0.5, 1);
  });

  it('detects rushed eccentric', () => {
    const rep = createTestRep(0.5, 1.0, 1.0);
    const dist = buildDistribution([1.8, 2.0, 2.2, 2.0, 1.9]);
    const expectation = createDistributionExpectation(dist);
    const result = assessRepEccentricControl(rep, expectation);

    expect(result.ratio).toBeLessThan(0.6);
    expect(result.isOutlier).toBe(true);
  });
});

describe('assessRepVelocity()', () => {
  it('compares velocity against expectation', () => {
    const rep = createTestRep(0.4, 1.0, 2.0);
    const expectation = createFixedExpectation(0.5);
    const result = assessRepVelocity(rep, expectation);

    expect(result.ratio).toBeCloseTo(0.8, 5);
  });
});

// =============================================================================
// Quality Flags Tests
// =============================================================================

describe('getRepQualityFlags()', () => {
  it('returns good quality for normal rep', () => {
    const rep = createTestRep(0.5, 1.0, 2.0);
    const baseline = createFixedBaseline();
    const flags = getRepQualityFlags(rep, baseline);

    expect(flags.partialRep).toBe(false);
    expect(flags.eccRushed).toBe(false);
    expect(flags.velocityOutlier).toBe(false);
    expect(flags.overallQuality).toBe('good');
  });

  it('detects partial rep', () => {
    const rep = createTestRep(0.5, 0.7, 2.0); // ROM = 70% of expected
    const baseline = createFixedBaseline();
    const flags = getRepQualityFlags(rep, baseline);

    expect(flags.partialRep).toBe(true);
    expect(flags.overallQuality).toBe('poor');
  });

  it('detects rushed eccentric', () => {
    const rep = createTestRep(0.5, 1.0, 1.0); // Ecc time = 50% of expected
    const baseline = createFixedBaseline();
    const flags = getRepQualityFlags(rep, baseline);

    expect(flags.eccRushed).toBe(true);
  });

  it('detects velocity outlier with distribution baseline', () => {
    const rep = createTestRep(0.2, 1.0, 2.0); // Very slow velocity
    const baseline = createDistributionBaseline();
    const flags = getRepQualityFlags(rep, baseline);

    expect(flags.velocityOutlier).toBe(true);
  });

  it('uses custom schemes', () => {
    const rep = createTestRep(0.5, 0.85, 2.0); // ROM = 85%
    const baseline = createFixedBaseline();

    // With default scheme: 85% is not partial (threshold is 80%)
    const defaultFlags = getRepQualityFlags(rep, baseline);
    expect(defaultFlags.partialRep).toBe(false);

    // With stricter scheme: 85% is partial (threshold is 90%)
    const strictScheme = createBreakpointScheme([{ below: 0.9, value: true }], false);
    const strictFlags = getRepQualityFlags(rep, baseline, { partialRep: strictScheme });
    expect(strictFlags.partialRep).toBe(true);
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('isPartialRep()', () => {
  it('returns true when ROM below threshold', () => {
    const rep = createTestRep(0.5, 0.7, 2.0);
    expect(isPartialRep(rep, 1.0, 0.8)).toBe(true);
  });

  it('returns false when ROM above threshold', () => {
    const rep = createTestRep(0.5, 0.9, 2.0);
    expect(isPartialRep(rep, 1.0, 0.8)).toBe(false);
  });

  it('uses custom threshold', () => {
    const rep = createTestRep(0.5, 0.85, 2.0);
    expect(isPartialRep(rep, 1.0, 0.8)).toBe(false);
    expect(isPartialRep(rep, 1.0, 0.9)).toBe(true);
  });
});

describe('isEccentricRushed()', () => {
  it('returns true when eccentric too fast', () => {
    const rep = createTestRep(0.5, 1.0, 1.0);
    expect(isEccentricRushed(rep, 2.0, 0.6)).toBe(true);
  });

  it('returns false when eccentric time normal', () => {
    const rep = createTestRep(0.5, 1.0, 1.5);
    expect(isEccentricRushed(rep, 2.0, 0.6)).toBe(false);
  });
});

describe('getRepROMRatio()', () => {
  it('computes ratio correctly', () => {
    const rep = createTestRep(0.5, 0.8, 2.0);
    expect(getRepROMRatio(rep, 1.0)).toBeCloseTo(0.8, 5);
  });

  it('returns 0 for zero expected', () => {
    const rep = createTestRep(0.5, 0.8, 2.0);
    expect(getRepROMRatio(rep, 0)).toBe(0);
  });
});

describe('getRepEccentricTimeRatio()', () => {
  it('computes ratio correctly', () => {
    const rep = createTestRep(0.5, 1.0, 1.5);
    expect(getRepEccentricTimeRatio(rep, 2.0)).toBeCloseTo(0.75, 1);
  });
});

describe('getRepVelocityRatio()', () => {
  it('computes ratio correctly', () => {
    const rep = createTestRep(0.4, 1.0, 2.0);
    expect(getRepVelocityRatio(rep, 0.5)).toBeCloseTo(0.8, 5);
  });
});

// =============================================================================
// Quality Assessment Tests
// =============================================================================

describe('assessRepQuality()', () => {
  it('returns detailed assessment', () => {
    const rep = createTestRep(0.5, 1.0, 2.0);
    const baseline = createFixedBaseline();
    const assessment = assessRepQuality(rep, baseline);

    expect(assessment.flags).toBeDefined();
    expect(assessment.romComparison).toBeDefined();
    expect(assessment.eccentricComparison).toBeDefined();
    expect(assessment.velocityComparison).toBeDefined();
  });

  it('assessment is consistent with individual functions', () => {
    const rep = createTestRep(0.5, 0.7, 2.0);
    const baseline = createFixedBaseline();
    const assessment = assessRepQuality(rep, baseline);

    expect(assessment.flags.partialRep).toBe(true);
    expect(assessment.romComparison.ratio).toBeCloseTo(0.7, 5);
  });
});

// =============================================================================
// Default Scheme Tests
// =============================================================================

describe('DEFAULT_PARTIAL_REP_SCHEME', () => {
  it('marks < 80% as partial', () => {
    expect(DEFAULT_PARTIAL_REP_SCHEME.breakpoints[0].below).toBe(0.8);
    expect(DEFAULT_PARTIAL_REP_SCHEME.breakpoints[0].value).toBe(true);
    expect(DEFAULT_PARTIAL_REP_SCHEME.fallback).toBe(false);
  });
});

describe('DEFAULT_ECC_RUSHED_SCHEME', () => {
  it('marks < 60% as rushed', () => {
    expect(DEFAULT_ECC_RUSHED_SCHEME.breakpoints[0].below).toBe(0.6);
    expect(DEFAULT_ECC_RUSHED_SCHEME.breakpoints[0].value).toBe(true);
    expect(DEFAULT_ECC_RUSHED_SCHEME.fallback).toBe(false);
  });
});
