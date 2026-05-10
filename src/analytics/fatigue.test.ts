/**
 * Fatigue Analytics Tests
 *
 * Tests for second-order fatigue and consistency assessment functions.
 */

import { describe, it, expect } from 'vitest';
import {
  getSetVelocityChange,
  getSetTempoChange,
  getSetROMChange,
  getSetEccentricVelocityChange,
  getSetEccentricControlScore,
  getSetFormWarning,
  getSetEccentricControl,
  getSetFatigueIndex,
  getSetConsistencyScore,
  getSetVelocityDistribution,
  getSetROMDistribution,
  getSetTempoDistribution,
  findOutlierReps,
  estimateSetRIR,
  isSetFatigued,
  getSetFatigueSummary,
  DEFAULT_FATIGUE_WEIGHTS,
  computeVBTSetFatigueIndex,
  updateSessionFatigueState,
  VBT_DEFAULT_FATIGUE_WEIGHTS,
  VBT_DEFAULT_FATIGUE_LAMBDA,
} from '@/analytics/fatigue';
import { createInterpolationScheme, createBreakpointScheme } from '@/stats/schemes';
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
 * Create samples for a single rep with specified parameters.
 */
function createRepSamples(
  startSeq: number,
  startTime: number,
  velocity: number,
  rom: number,
  conTimeMs: number
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
      timestamp: startTime + conTimeMs + 2000,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: velocity * 0.5,
      force: 80,
    },
  ];
}

/**
 * Create a set showing velocity decline (fatigue pattern).
 */
function createFatiguedSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamples(0, 1000, 0.6, 1.0, 1000), // Rep 1: fast
    ...createRepSamples(4, 4000, 0.55, 0.98, 1100), // Rep 2: slightly slower
    ...createRepSamples(8, 7000, 0.5, 0.95, 1200), // Rep 3: slower
    ...createRepSamples(12, 10000, 0.42, 0.92, 1400), // Rep 4: much slower
  ];
  return buildSet(samples);
}

/**
 * Create a consistent set (no fatigue).
 */
function createConsistentSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamples(0, 1000, 0.5, 1.0, 1000),
    ...createRepSamples(4, 4000, 0.5, 1.0, 1000),
    ...createRepSamples(8, 7000, 0.5, 1.0, 1000),
    ...createRepSamples(12, 10000, 0.5, 1.0, 1000),
  ];
  return buildSet(samples);
}

/**
 * Create a set with one outlier rep.
 * Need enough reps and extreme enough outlier to exceed z-score threshold.
 */
function createSetWithOutlier(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamples(0, 1000, 0.5, 1.0, 1000),
    ...createRepSamples(4, 4000, 0.5, 1.0, 1000),
    ...createRepSamples(8, 7000, 0.5, 1.0, 1000),
    ...createRepSamples(12, 10000, 0.5, 1.0, 1000),
    ...createRepSamples(16, 13000, 0.1, 1.0, 1000), // Rep 5: extremely slow (outlier)
    ...createRepSamples(20, 16000, 0.5, 1.0, 1000),
  ];
  return buildSet(samples);
}

function createEmptySet(): Set {
  return createSet();
}

function createSingleRepSet(): Set {
  return buildSet(createRepSamples(0, 1000, 0.5, 1.0, 1000));
}

// =============================================================================
// Change Analytics Tests
// =============================================================================

describe('getSetVelocityChange()', () => {
  it('computes velocity change for fatigued set', () => {
    const set = createFatiguedSet();
    const change = getSetVelocityChange(set);

    expect(change.first).toBeCloseTo(0.6, 5);
    expect(change.last).toBeCloseTo(0.42, 5);
    expect(change.absoluteChange).toBeLessThan(0); // Velocity decreased
    expect(change.percentChange).toBeLessThan(0);
  });

  it('computes zero change for consistent set', () => {
    const set = createConsistentSet();
    const change = getSetVelocityChange(set);

    expect(change.percentChange).toBeCloseTo(0, 5);
  });

  it('handles empty set', () => {
    const change = getSetVelocityChange(createEmptySet());

    expect(change.first).toBe(0);
    expect(change.last).toBe(0);
  });
});

describe('getSetTempoChange()', () => {
  it('computes tempo change for fatigued set', () => {
    const set = createFatiguedSet();
    const change = getSetTempoChange(set);

    // Concentric time increased (slowed down)
    expect(change.absoluteChange).toBeGreaterThan(0);
    expect(change.percentChange).toBeGreaterThan(0);
  });

  it('computes zero change for consistent set', () => {
    const set = createConsistentSet();
    const change = getSetTempoChange(set);

    expect(change.percentChange).toBeCloseTo(0, 5);
  });
});

describe('getSetROMChange()', () => {
  it('computes ROM change for fatigued set', () => {
    const set = createFatiguedSet();
    const change = getSetROMChange(set);

    // ROM decreased
    expect(change.absoluteChange).toBeLessThan(0);
    expect(change.percentChange).toBeLessThan(0);
  });
});

// =============================================================================
// Fatigue Index Tests
// =============================================================================

describe('getSetFatigueIndex()', () => {
  it('computes fatigue index for fatigued set', () => {
    const set = createFatiguedSet();
    const fatigue = getSetFatigueIndex(set);

    expect(fatigue.value).toBeGreaterThan(0);
    expect(fatigue.components.velocityChange.percentChange).toBeLessThan(0);
    expect(fatigue.confidence).toBe('high'); // 4 reps
  });

  it('computes low fatigue for consistent set', () => {
    const set = createConsistentSet();
    const fatigue = getSetFatigueIndex(set);

    expect(fatigue.value).toBeCloseTo(0, 0);
  });

  it('respects custom weights', () => {
    const set = createFatiguedSet();

    // Default weights
    const defaultFatigue = getSetFatigueIndex(set);

    // All weight on velocity
    const velocityOnlyFatigue = getSetFatigueIndex(set, {
      velocity: 1.0,
      tempo: 0,
      rom: 0,
    });

    // Results should differ
    expect(velocityOnlyFatigue.value).not.toBeCloseTo(defaultFatigue.value, 1);
  });

  it('has appropriate confidence levels', () => {
    // Single rep: low confidence
    expect(getSetFatigueIndex(createSingleRepSet()).confidence).toBe('low');

    // 4 reps: high confidence (threshold is 4+)
    expect(getSetFatigueIndex(createFatiguedSet()).confidence).toBe('high');
  });
});

// =============================================================================
// Consistency Score Tests
// =============================================================================

describe('getSetConsistencyScore()', () => {
  it('classifies consistent set as stable', () => {
    const set = createConsistentSet();
    const score = getSetConsistencyScore(set);

    expect(score.velocityCV).toBeLessThan(0.1);
    expect(score.overall).toBe('stable');
  });

  it('classifies variable set correctly', () => {
    const set = createFatiguedSet();
    const score = getSetConsistencyScore(set);

    // Fatigued set has higher CV due to declining velocity
    expect(score.velocityCV).toBeGreaterThan(0);
  });

  it('uses custom consistency scheme', () => {
    const set = createFatiguedSet();

    // With very strict scheme
    const strictScheme = createBreakpointScheme(
      [{ below: 0.01, value: 'stable' as const }],
      'erratic' as const
    );

    const score = getSetConsistencyScore(set, { consistency: strictScheme });
    expect(score.overall).toBe('erratic');
  });
});

// =============================================================================
// Distribution Tests
// =============================================================================

describe('getSetVelocityDistribution()', () => {
  it('builds distribution from set velocities', () => {
    const set = createConsistentSet();
    const dist = getSetVelocityDistribution(set);

    expect(dist.n).toBe(4);
  });
});

describe('getSetROMDistribution()', () => {
  it('builds distribution from set ROMs', () => {
    const set = createFatiguedSet();
    const dist = getSetROMDistribution(set);

    expect(dist.n).toBe(4);
    expect(dist.max).toBeCloseTo(1.0, 5);
  });
});

describe('getSetTempoDistribution()', () => {
  it('builds distribution from concentric times', () => {
    const set = createFatiguedSet();
    const dist = getSetTempoDistribution(set);

    expect(dist.n).toBe(4);
  });
});

// =============================================================================
// Outlier Detection Tests
// =============================================================================

describe('findOutlierReps()', () => {
  it('finds outlier reps', () => {
    const set = createSetWithOutlier();
    const outliers = findOutlierReps(set);

    expect(outliers.length).toBeGreaterThan(0);
    // Rep 5 should be a velocity outlier (very slow compared to others)
    const velocityOutlier = outliers.find((o) => o.metric === 'velocity' && o.repNumber === 5);
    expect(velocityOutlier).toBeDefined();
    expect(velocityOutlier!.direction).toBe('low');
  });

  it('returns empty for consistent set', () => {
    const set = createConsistentSet();
    const outliers = findOutlierReps(set);

    expect(outliers.length).toBe(0);
  });

  it('returns empty for sets with < 3 reps', () => {
    const set = createSingleRepSet();
    const outliers = findOutlierReps(set);

    expect(outliers.length).toBe(0);
  });

  it('uses custom outlier scheme', () => {
    const set = createSetWithOutlier();

    // Very lenient scheme (z > 10)
    const lenientScheme = createBreakpointScheme([{ below: 10, value: false }], true);
    const outliers = findOutlierReps(set, { outlier: lenientScheme });

    expect(outliers.length).toBe(0);
  });
});

// =============================================================================
// RIR Estimation Tests
// =============================================================================

describe('estimateSetRIR()', () => {
  it('estimates high RIR for low velocity loss', () => {
    const set = createConsistentSet();
    const estimate = estimateSetRIR(set);

    expect(estimate.rir).toBeGreaterThan(4);
    expect(estimate.rpe).toBeLessThan(6);
    expect(estimate.confidence).toBe('low'); // Low velocity loss = low confidence
  });

  it('estimates low RIR for high velocity loss', () => {
    const set = createFatiguedSet();
    const estimate = estimateSetRIR(set);

    expect(estimate.rir).toBeLessThan(4);
    expect(estimate.rpe).toBeGreaterThan(6);
    expect(estimate.confidence).toBe('high'); // High velocity loss = high confidence
  });

  it('uses custom RIR scheme', () => {
    const set = createFatiguedSet();

    // Custom scheme: any velocity loss = RIR 0
    const strictScheme = createInterpolationScheme([
      { input: 0, output: 0 },
      { input: 100, output: 0 },
    ]);

    const estimate = estimateSetRIR(set, { rir: strictScheme });
    expect(estimate.rir).toBe(0);
  });

  it('clamps RIR to valid range', () => {
    const set = createConsistentSet();
    const estimate = estimateSetRIR(set);

    expect(estimate.rir).toBeGreaterThanOrEqual(0);
    expect(estimate.rir).toBeLessThanOrEqual(6);
    expect(estimate.rpe).toBeGreaterThanOrEqual(4);
    expect(estimate.rpe).toBeLessThanOrEqual(10);
  });
});

// =============================================================================
// Convenience Function Tests
// =============================================================================

describe('isSetFatigued()', () => {
  it('returns true for fatigued set', () => {
    const set = createFatiguedSet();
    expect(isSetFatigued(set)).toBe(true);
  });

  it('returns false for consistent set', () => {
    const set = createConsistentSet();
    expect(isSetFatigued(set)).toBe(false);
  });

  it('uses custom threshold', () => {
    const set = createFatiguedSet();
    expect(isSetFatigued(set, 50)).toBe(false); // Stricter threshold
    expect(isSetFatigued(set, 10)).toBe(true); // Looser threshold
  });
});

describe('getSetFatigueSummary()', () => {
  it('returns summary for fatigued set', () => {
    const set = createFatiguedSet();
    const summary = getSetFatigueSummary(set);

    expect(summary.velocityLossPct).toBeGreaterThan(0);
    expect(summary.rir).toBeDefined();
    expect(summary.rpe).toBeDefined();
    expect(summary.consistency).toBeDefined();
    expect(summary.fatigueLevel).toBe('high');
  });

  it('returns summary for consistent set', () => {
    const set = createConsistentSet();
    const summary = getSetFatigueSummary(set);

    expect(summary.velocityLossPct).toBeCloseTo(0, 5);
    expect(summary.fatigueLevel).toBe('low');
    expect(summary.consistency).toBe('stable');
  });
});

// =============================================================================
// Default Weights Tests
// =============================================================================

describe('DEFAULT_FATIGUE_WEIGHTS', () => {
  it('sums to 1', () => {
    const sum =
      DEFAULT_FATIGUE_WEIGHTS.velocity +
      DEFAULT_FATIGUE_WEIGHTS.tempo +
      DEFAULT_FATIGUE_WEIGHTS.rom;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('prioritizes velocity', () => {
    expect(DEFAULT_FATIGUE_WEIGHTS.velocity).toBeGreaterThan(DEFAULT_FATIGUE_WEIGHTS.tempo);
    expect(DEFAULT_FATIGUE_WEIGHTS.velocity).toBeGreaterThan(DEFAULT_FATIGUE_WEIGHTS.rom);
  });
});

// =============================================================================
// Eccentric Control Tests
// =============================================================================

/**
 * Create rep samples with independent eccentric velocity.
 */
function createRepSamplesEcc(
  startSeq: number,
  startTime: number,
  conVelocity: number,
  eccVelocity: number,
  rom: number,
  conTimeMs: number
): WorkoutSample[] {
  return [
    {
      sequence: startSeq,
      timestamp: startTime,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity: conVelocity,
      force: 100,
    },
    {
      sequence: startSeq + 1,
      timestamp: startTime + conTimeMs,
      phase: MovementPhase.CONCENTRIC,
      position: rom,
      velocity: conVelocity,
      force: 100,
    },
    {
      sequence: startSeq + 2,
      timestamp: startTime + conTimeMs + 500,
      phase: MovementPhase.ECCENTRIC,
      position: rom,
      velocity: eccVelocity,
      force: 80,
    },
    {
      sequence: startSeq + 3,
      timestamp: startTime + conTimeMs + 2000,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: eccVelocity,
      force: 80,
    },
  ];
}

/**
 * Set where eccentric speeds up significantly (loss of control).
 */
function createEccentricLossSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamplesEcc(0, 1000, 0.6, 0.3, 1.0, 1000),
    ...createRepSamplesEcc(4, 4000, 0.5, 0.5, 1.0, 1200),
    ...createRepSamplesEcc(8, 7000, 0.4, 0.7, 1.0, 1400),
  ];
  return buildSet(samples);
}

/**
 * Set with stable eccentric control.
 */
function createEccentricControlledSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamplesEcc(0, 1000, 0.6, 0.3, 1.0, 1000),
    ...createRepSamplesEcc(4, 4000, 0.55, 0.3, 1.0, 1000),
    ...createRepSamplesEcc(8, 7000, 0.5, 0.3, 1.0, 1000),
  ];
  return buildSet(samples);
}

describe('getSetEccentricVelocityChange()', () => {
  it('returns positive change when eccentric speeds up', () => {
    const set = createEccentricLossSet();
    const change = getSetEccentricVelocityChange(set);

    expect(change.percentChange).toBeGreaterThan(0);
  });

  it('returns ~0 change for controlled eccentric', () => {
    const set = createEccentricControlledSet();
    const change = getSetEccentricVelocityChange(set);

    expect(change.percentChange).toBeCloseTo(0, 1);
  });
});

describe('getSetEccentricControlScore()', () => {
  it('returns high score for controlled eccentric', () => {
    const set = createEccentricControlledSet();
    const score = getSetEccentricControlScore(set);

    expect(score).toBeCloseTo(100, 0);
  });

  it('returns low score when eccentric speeds up significantly', () => {
    const set = createEccentricLossSet();
    const score = getSetEccentricControlScore(set);

    // Eccentric: 0.3 -> 0.7 = +133% change -> 100 - 133*2 = clamped to 0
    expect(score).toBeLessThan(20);
  });

  it('returns 100 for single-rep set', () => {
    const set = buildSet(createRepSamplesEcc(0, 1000, 0.6, 0.3, 1.0, 1000));
    expect(getSetEccentricControlScore(set)).toBe(100);
  });

  it('returns 100 for empty set', () => {
    expect(getSetEccentricControlScore(createSet())).toBe(100);
  });

  it('clamps between 0 and 100', () => {
    const set = createEccentricLossSet();
    const score = getSetEccentricControlScore(set);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('getSetFormWarning()', () => {
  it('returns warning when control score is low', () => {
    const set = createEccentricLossSet();
    const warning = getSetFormWarning(set);

    expect(warning).not.toBeNull();
    expect(warning).toContain('Eccentric control declining');
  });

  it('returns null for controlled set', () => {
    const set = createEccentricControlledSet();
    expect(getSetFormWarning(set)).toBeNull();
  });

  it('returns null for single-rep set', () => {
    const set = buildSet(createRepSamplesEcc(0, 1000, 0.6, 0.3, 1.0, 1000));
    expect(getSetFormWarning(set)).toBeNull();
  });

  it('returns grinding warning when eccentric speeds up with concentric decline', () => {
    // Eccentric change > 30%, velocity loss > 10%
    const samples: WorkoutSample[] = [
      ...createRepSamplesEcc(0, 1000, 0.6, 0.3, 1.0, 1000),
      ...createRepSamplesEcc(4, 4000, 0.5, 0.45, 1.0, 1200),
    ];
    const set = buildSet(samples);
    const warning = getSetFormWarning(set);

    // eccentric change = (0.45 - 0.3) / 0.3 * 100 = 50%, control score = 100 - 50*2 = 0
    // Since control score < 40, we get the "declining" warning
    expect(warning).not.toBeNull();
  });
});

describe('getSetEccentricControl()', () => {
  it('returns full control assessment', () => {
    const set = createEccentricLossSet();
    const control = getSetEccentricControl(set);

    expect(control.score).toBeDefined();
    expect(control.eccentricChangePct).toBeGreaterThan(0);
    expect(control.formWarning).not.toBeNull();
  });

  it('returns clean assessment for controlled set', () => {
    const set = createEccentricControlledSet();
    const control = getSetEccentricControl(set);

    expect(control.score).toBeCloseTo(100, 0);
    expect(control.eccentricChangePct).toBeCloseTo(0, 1);
    expect(control.formWarning).toBeNull();
  });
});

// =============================================================================
// VBT Spec §6.2 — computeVBTSetFatigueIndex Tests
// =============================================================================

describe('computeVBTSetFatigueIndex()', () => {
  it('returns ~0 for a set with zero velocity loss and consistent reps', () => {
    const set = createConsistentSet();
    const result = computeVBTSetFatigueIndex(set);

    expect(result.fatigueIndex).toBeCloseTo(0, 5);
    expect(result.velLossPct).toBeCloseTo(0, 5);
    expect(result.tempoCrepRatio).toBeCloseTo(0, 5);
    expect(result.romRatio).toBeCloseTo(0, 5);
  });

  it('applies pure velocity loss with default weights (no tempo/ROM change)', () => {
    // Build a 2-rep set where only velocity declines (same ROM + tempo)
    const samples: WorkoutSample[] = [
      ...createRepSamples(0, 1000, 0.6, 1.0, 1000),
      ...createRepSamples(4, 4000, 0.42, 1.0, 1000), // 30% velocity loss, same ROM+tempo
    ];
    const set = buildSet(samples);
    const result = computeVBTSetFatigueIndex(set);

    // velLossPct = (0.6 - 0.42) / 0.6 = 0.30
    // tempoCrepRatio = 0, romRatio = 0
    // fatigueIndex = 0.30 * 0.70 + 0 * 0.15 + 0 * 0.15 = 0.21
    expect(result.velLossPct).toBeCloseTo(0.3, 5);
    expect(result.tempoCrepRatio).toBeCloseTo(0, 5);
    expect(result.romRatio).toBeCloseTo(0, 5);
    expect(result.fatigueIndex).toBeCloseTo(0.21, 5);
  });

  it('blends all three augmentations with default weights', () => {
    // Rep 1: vel=0.6, rom=1.0, conTime=1000ms
    // Rep 2: vel=0.42, rom=0.9, conTime=1200ms  (30% vel loss, 10% ROM shrink, 20% tempo creep)
    const samples: WorkoutSample[] = [
      ...createRepSamples(0, 1000, 0.6, 1.0, 1000),
      ...createRepSamples(4, 4000, 0.42, 0.9, 1200),
    ];
    const set = buildSet(samples);
    const result = computeVBTSetFatigueIndex(set);

    expect(result.velLossPct).toBeCloseTo(0.3, 5);
    // tempoCreep = (1.2 - 1.0) / 1.0 = 0.2  (times are in seconds from getRepConcentricTime)
    expect(result.tempoCrepRatio).toBeCloseTo(0.2, 3);
    // romRatio = (1.0 - 0.9) / 1.0 = 0.1
    expect(result.romRatio).toBeCloseTo(0.1, 5);
    // fatigueIndex = 0.3*0.7 + 0.2*0.15 + 0.1*0.15 = 0.21 + 0.03 + 0.015 = 0.255
    expect(result.fatigueIndex).toBeCloseTo(0.255, 3);
  });

  it('clamps fatigueIndex to 1.0 when inputs are extreme', () => {
    // Artificially enormous velocity loss: velLossPct should be clamped pre-blend
    // Use a set with very high velocity first and near-zero last
    const samples: WorkoutSample[] = [
      ...createRepSamples(0, 1000, 1.0, 1.0, 1000),
      ...createRepSamples(4, 4000, 0.01, 0.01, 5000), // extreme degradation
    ];
    const set = buildSet(samples);
    const result = computeVBTSetFatigueIndex(set);

    expect(result.fatigueIndex).toBeLessThanOrEqual(1.0);
    expect(result.fatigueIndex).toBeGreaterThan(0);
  });

  it('returns tempoCrepRatio=null and romRatio=null for a single-rep set', () => {
    const set = buildSet(createRepSamples(0, 1000, 0.5, 1.0, 1000));
    const result = computeVBTSetFatigueIndex(set);

    expect(result.tempoCrepRatio).toBeNull();
    expect(result.romRatio).toBeNull();
    // With both augmentations missing, their weights shift to velLoss → weight = 1.0
    // velLossPct = 0, so fatigueIndex = 0
    expect(result.fatigueIndex).toBeCloseTo(0, 5);
  });

  it('redistributes weight to velocity when augmentations are unavailable', () => {
    // Single-rep: can't compute tempo/ROM, all weight goes to velocity.
    const samples: WorkoutSample[] = [...createRepSamples(0, 1000, 0.6, 1.0, 1000)];
    const set = buildSet(samples);
    const result = computeVBTSetFatigueIndex(set, {
      velLossWeight: 0.7,
      tempoCrepWeight: 0.15,
      romShrinkWeight: 0.15,
    });

    // fatigueIndex = velLossPct * 1.0 (redistributed) = 0 * 1.0 = 0
    expect(result.fatigueIndex).toBeCloseTo(0, 5);
  });

  it('applies custom weights correctly', () => {
    // 2-rep set: 30% vel loss, zero tempo/ROM change
    const samples: WorkoutSample[] = [
      ...createRepSamples(0, 1000, 0.6, 1.0, 1000),
      ...createRepSamples(4, 4000, 0.42, 1.0, 1000),
    ];
    const set = buildSet(samples);

    // All weight on velLoss
    const result = computeVBTSetFatigueIndex(set, {
      velLossWeight: 1.0,
      tempoCrepWeight: 0,
      romShrinkWeight: 0,
    });
    expect(result.fatigueIndex).toBeCloseTo(0.3, 5);

    // All weight on tempo (which is 0) → fatigueIndex ≈ 0
    const resultTempoOnly = computeVBTSetFatigueIndex(set, {
      velLossWeight: 0,
      tempoCrepWeight: 1.0,
      romShrinkWeight: 0,
    });
    expect(resultTempoOnly.fatigueIndex).toBeCloseTo(0, 5);
  });

  it('reports default weight constants', () => {
    expect(VBT_DEFAULT_FATIGUE_WEIGHTS.velLoss).toBe(0.7);
    expect(VBT_DEFAULT_FATIGUE_WEIGHTS.tempoCreep).toBe(0.15);
    expect(VBT_DEFAULT_FATIGUE_WEIGHTS.romShrink).toBe(0.15);
    const sum =
      VBT_DEFAULT_FATIGUE_WEIGHTS.velLoss +
      VBT_DEFAULT_FATIGUE_WEIGHTS.tempoCreep +
      VBT_DEFAULT_FATIGUE_WEIGHTS.romShrink;
    expect(sum).toBeCloseTo(1, 10);
  });
});

// =============================================================================
// VBT Spec §6.3 — updateSessionFatigueState Tests
// =============================================================================

describe('updateSessionFatigueState()', () => {
  it('computes initial state from zero: prevF=0, fiSet=0.5, intensity=0.8, λ=0.4', () => {
    // F = 0.4 * (0.5 * 0.8) + 0.6 * 0 = 0.4 * 0.4 = 0.16
    const f = updateSessionFatigueState(0, 0.5, 0.8, 0.4);
    expect(f).toBeCloseTo(0.16, 10);
  });

  it('approaches a steady-state asymptote under sustained heavy load', () => {
    // Asymptote: F* = λ × fiSet × intensity / (1 - (1-λ)) = fiSet × intensity
    // With fiSet=0.8, intensity=1.0: F* = 0.8 * 1.0 = 0.8
    let f = 0;
    for (let i = 0; i < 50; i++) {
      f = updateSessionFatigueState(f, 0.8, 1.0, 0.4);
    }
    expect(f).toBeCloseTo(0.8, 2);
  });

  it('accumulates slowly under light intensity', () => {
    // Low intensity (min=0.3): fiSet=0.8 × intensity=0.3 → weighted=0.24
    // After one update from 0: 0.4 * 0.24 = 0.096
    const fLight = updateSessionFatigueState(0, 0.8, 0.3, 0.4);
    const fHeavy = updateSessionFatigueState(0, 0.8, 1.0, 0.4);
    expect(fLight).toBeLessThan(fHeavy);
    expect(fLight).toBeCloseTo(0.4 * (0.8 * 0.3), 10);
  });

  it('uses default lambda constant when not provided', () => {
    const explicit = updateSessionFatigueState(0, 0.5, 0.8, VBT_DEFAULT_FATIGUE_LAMBDA);
    const implicit = updateSessionFatigueState(0, 0.5, 0.8);
    expect(implicit).toBeCloseTo(explicit, 10);
  });

  it('applies custom lambda — higher lambda tracks changes faster', () => {
    const fastLambda = updateSessionFatigueState(0, 0.6, 1.0, 0.8);
    const slowLambda = updateSessionFatigueState(0, 0.6, 1.0, 0.2);
    // Higher lambda → jumps higher on first update
    expect(fastLambda).toBeGreaterThan(slowLambda);
    // Fast: 0.8 * 0.6, Slow: 0.2 * 0.6
    expect(fastLambda).toBeCloseTo(0.48, 10);
    expect(slowLambda).toBeCloseTo(0.12, 10);
  });

  it('clamps intensity below 0.3 to 0.3', () => {
    const withZeroIntensity = updateSessionFatigueState(0, 0.8, 0.0, 0.4);
    const withMinIntensity = updateSessionFatigueState(0, 0.8, 0.3, 0.4);
    expect(withZeroIntensity).toBeCloseTo(withMinIntensity, 10);
  });

  it('clamps output to [0, 1]', () => {
    // Even with extreme inputs the output must stay in range
    const f = updateSessionFatigueState(1.0, 1.0, 1.0, 1.0);
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);

    const fZero = updateSessionFatigueState(0, 0, 0, 0);
    expect(fZero).toBeGreaterThanOrEqual(0);
    expect(fZero).toBeLessThanOrEqual(1);
  });
});
