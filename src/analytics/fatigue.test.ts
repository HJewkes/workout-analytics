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
    { sequence: startSeq, timestamp: startTime, phase: MovementPhase.CONCENTRIC, position: 0, velocity, force: 100 },
    { sequence: startSeq + 1, timestamp: startTime + conTimeMs, phase: MovementPhase.CONCENTRIC, position: rom, velocity, force: 100 },
    { sequence: startSeq + 2, timestamp: startTime + conTimeMs + 500, phase: MovementPhase.ECCENTRIC, position: rom, velocity: velocity * 0.5, force: 80 },
    { sequence: startSeq + 3, timestamp: startTime + conTimeMs + 2000, phase: MovementPhase.ECCENTRIC, position: 0, velocity: velocity * 0.5, force: 80 },
  ];
}

/**
 * Create a set showing velocity decline (fatigue pattern).
 */
function createFatiguedSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamples(0, 1000, 0.6, 1.0, 1000),   // Rep 1: fast
    ...createRepSamples(4, 4000, 0.55, 0.98, 1100), // Rep 2: slightly slower
    ...createRepSamples(8, 7000, 0.5, 0.95, 1200),  // Rep 3: slower
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
    ...createRepSamples(16, 13000, 0.1, 1.0, 1000),  // Rep 5: extremely slow (outlier)
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
    const velocityOutlier = outliers.find(
      (o) => o.metric === 'velocity' && o.repNumber === 5
    );
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
