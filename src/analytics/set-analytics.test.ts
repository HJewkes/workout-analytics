/**
 * Set Analytics Tests
 *
 * Tests for first-order set analytics functions.
 */

import { describe, it, expect } from 'vitest';
import {
  getSetFirstRepVelocity,
  getSetLastRepVelocity,
  getSetBestRepVelocity,
  getSetVelocityLossPct,
  getSetMeanVelocity,
  getSetPeakVelocity,
  getSetRepVelocities,
  getSetMeanROM,
  getSetBestROM,
  getSetFirstRepROM,
  getSetLastRepROM,
  getSetRepROMs,
  getSetRepVelocityAt,
  getSetRepROMAt,
  getSetVelocitySummary,
} from '@/analytics/set-analytics';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Build a set from samples using the functional API.
 */
function buildSet(samples: WorkoutSample[]): Set {
  let set = createSet();
  for (const sample of samples) {
    set = addSampleToSet(set, sample);
  }
  return set;
}

/**
 * Create samples for a single rep with specified velocity and ROM.
 */
function createRepSamples(
  repStartSeq: number,
  repStartTime: number,
  velocity: number,
  rom: number
): WorkoutSample[] {
  return [
    // Concentric
    {
      sequence: repStartSeq,
      timestamp: repStartTime,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity,
      force: 100,
    },
    {
      sequence: repStartSeq + 1,
      timestamp: repStartTime + 500,
      phase: MovementPhase.CONCENTRIC,
      position: rom,
      velocity,
      force: 100,
    },
    // Eccentric
    {
      sequence: repStartSeq + 2,
      timestamp: repStartTime + 1000,
      phase: MovementPhase.ECCENTRIC,
      position: rom,
      velocity: velocity * 0.5,
      force: 80,
    },
    {
      sequence: repStartSeq + 3,
      timestamp: repStartTime + 2000,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: velocity * 0.5,
      force: 80,
    },
  ];
}

/**
 * Create a test set with 3 reps showing velocity decline.
 * Rep 1: velocity 0.6, ROM 1.0
 * Rep 2: velocity 0.5, ROM 0.95
 * Rep 3: velocity 0.4, ROM 0.9
 */
function createDecliningSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamples(0, 1000, 0.6, 1.0),
    ...createRepSamples(4, 3000, 0.5, 0.95),
    ...createRepSamples(8, 5000, 0.4, 0.9),
  ];
  return buildSet(samples);
}

/**
 * Create a test set with constant velocity.
 */
function createConstantSet(): Set {
  const samples: WorkoutSample[] = [
    ...createRepSamples(0, 1000, 0.5, 1.0),
    ...createRepSamples(4, 3000, 0.5, 1.0),
    ...createRepSamples(8, 5000, 0.5, 1.0),
  ];
  return buildSet(samples);
}

/**
 * Create an empty set.
 */
function createEmptySet(): Set {
  return createSet();
}

/**
 * Create a single-rep set.
 */
function createSingleRepSet(): Set {
  return buildSet(createRepSamples(0, 1000, 0.6, 1.0));
}

// =============================================================================
// Velocity Analytics Tests
// =============================================================================

describe('getSetFirstRepVelocity()', () => {
  it('returns first rep velocity', () => {
    const set = createDecliningSet();
    expect(getSetFirstRepVelocity(set)).toBeCloseTo(0.6, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetFirstRepVelocity(createEmptySet())).toBe(0);
  });
});

describe('getSetLastRepVelocity()', () => {
  it('returns last rep velocity', () => {
    const set = createDecliningSet();
    expect(getSetLastRepVelocity(set)).toBeCloseTo(0.4, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetLastRepVelocity(createEmptySet())).toBe(0);
  });

  it('returns same as first for single-rep set', () => {
    const set = createSingleRepSet();
    expect(getSetLastRepVelocity(set)).toBe(getSetFirstRepVelocity(set));
  });
});

describe('getSetBestRepVelocity()', () => {
  it('returns maximum velocity', () => {
    const set = createDecliningSet();
    expect(getSetBestRepVelocity(set)).toBeCloseTo(0.6, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetBestRepVelocity(createEmptySet())).toBe(0);
  });
});

describe('getSetVelocityLossPct()', () => {
  it('computes velocity loss percentage', () => {
    const set = createDecliningSet();
    // (0.6 - 0.4) / 0.6 × 100 = 33.33%
    expect(getSetVelocityLossPct(set)).toBeCloseTo(33.33, 1);
  });

  it('returns 0 for constant velocity set', () => {
    const set = createConstantSet();
    expect(getSetVelocityLossPct(set)).toBeCloseTo(0, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetVelocityLossPct(createEmptySet())).toBe(0);
  });

  it('returns 0 for single-rep set', () => {
    expect(getSetVelocityLossPct(createSingleRepSet())).toBe(0);
  });

  it('handles negative loss (velocity increase)', () => {
    // Create set where velocity increases
    const samples: WorkoutSample[] = [
      ...createRepSamples(0, 1000, 0.4, 1.0),
      ...createRepSamples(4, 3000, 0.6, 1.0),
    ];
    const set = buildSet(samples);
    // (0.4 - 0.6) / 0.4 × 100 = -50%
    expect(getSetVelocityLossPct(set)).toBeCloseTo(-50, 1);
  });
});

describe('getSetMeanVelocity()', () => {
  it('computes mean velocity across reps', () => {
    const set = createDecliningSet();
    // (0.6 + 0.5 + 0.4) / 3 = 0.5
    expect(getSetMeanVelocity(set)).toBeCloseTo(0.5, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetMeanVelocity(createEmptySet())).toBe(0);
  });
});

describe('getSetPeakVelocity()', () => {
  it('returns maximum peak velocity', () => {
    const set = createDecliningSet();
    // Peak velocity equals mean velocity in our test samples
    expect(getSetPeakVelocity(set)).toBeCloseTo(0.6, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetPeakVelocity(createEmptySet())).toBe(0);
  });
});

describe('getSetRepVelocities()', () => {
  it('returns array of velocities', () => {
    const set = createDecliningSet();
    const velocities = getSetRepVelocities(set);

    expect(velocities).toHaveLength(3);
    expect(velocities[0]).toBeCloseTo(0.6, 5);
    expect(velocities[1]).toBeCloseTo(0.5, 5);
    expect(velocities[2]).toBeCloseTo(0.4, 5);
  });

  it('returns empty array for empty set', () => {
    expect(getSetRepVelocities(createEmptySet())).toEqual([]);
  });
});

// =============================================================================
// ROM Analytics Tests
// =============================================================================

describe('getSetMeanROM()', () => {
  it('computes mean ROM across reps', () => {
    const set = createDecliningSet();
    // (1.0 + 0.95 + 0.9) / 3 = 0.95
    expect(getSetMeanROM(set)).toBeCloseTo(0.95, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetMeanROM(createEmptySet())).toBe(0);
  });
});

describe('getSetBestROM()', () => {
  it('returns maximum ROM', () => {
    const set = createDecliningSet();
    expect(getSetBestROM(set)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetBestROM(createEmptySet())).toBe(0);
  });
});

describe('getSetFirstRepROM()', () => {
  it('returns first rep ROM', () => {
    const set = createDecliningSet();
    expect(getSetFirstRepROM(set)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetFirstRepROM(createEmptySet())).toBe(0);
  });
});

describe('getSetLastRepROM()', () => {
  it('returns last rep ROM', () => {
    const set = createDecliningSet();
    expect(getSetLastRepROM(set)).toBeCloseTo(0.9, 5);
  });

  it('returns 0 for empty set', () => {
    expect(getSetLastRepROM(createEmptySet())).toBe(0);
  });
});

describe('getSetRepROMs()', () => {
  it('returns array of ROMs', () => {
    const set = createDecliningSet();
    const roms = getSetRepROMs(set);

    expect(roms).toHaveLength(3);
    expect(roms[0]).toBeCloseTo(1.0, 5);
    expect(roms[1]).toBeCloseTo(0.95, 5);
    expect(roms[2]).toBeCloseTo(0.9, 5);
  });
});

// =============================================================================
// Rep Index Helpers Tests
// =============================================================================

describe('getSetRepVelocityAt()', () => {
  it('returns velocity for specified rep (1-based)', () => {
    const set = createDecliningSet();
    expect(getSetRepVelocityAt(set, 1)).toBeCloseTo(0.6, 5);
    expect(getSetRepVelocityAt(set, 2)).toBeCloseTo(0.5, 5);
    expect(getSetRepVelocityAt(set, 3)).toBeCloseTo(0.4, 5);
  });

  it('returns 0 for out-of-range rep', () => {
    const set = createDecliningSet();
    expect(getSetRepVelocityAt(set, 0)).toBe(0);
    expect(getSetRepVelocityAt(set, 4)).toBe(0);
  });
});

describe('getSetRepROMAt()', () => {
  it('returns ROM for specified rep (1-based)', () => {
    const set = createDecliningSet();
    expect(getSetRepROMAt(set, 1)).toBeCloseTo(1.0, 5);
    expect(getSetRepROMAt(set, 2)).toBeCloseTo(0.95, 5);
    expect(getSetRepROMAt(set, 3)).toBeCloseTo(0.9, 5);
  });

  it('returns 0 for out-of-range rep', () => {
    const set = createDecliningSet();
    expect(getSetRepROMAt(set, 0)).toBe(0);
    expect(getSetRepROMAt(set, 4)).toBe(0);
  });
});

// =============================================================================
// Summary Statistics Tests
// =============================================================================

describe('getSetVelocitySummary()', () => {
  it('returns comprehensive velocity summary', () => {
    const set = createDecliningSet();
    const summary = getSetVelocitySummary(set);

    expect(summary.first).toBeCloseTo(0.6, 5);
    expect(summary.last).toBeCloseTo(0.4, 5);
    expect(summary.best).toBeCloseTo(0.6, 5);
    expect(summary.mean).toBeCloseTo(0.5, 5);
    expect(summary.lossPct).toBeCloseTo(33.33, 1);
    expect(summary.repCount).toBe(3);
  });

  it('handles empty set', () => {
    const summary = getSetVelocitySummary(createEmptySet());

    expect(summary.first).toBe(0);
    expect(summary.last).toBe(0);
    expect(summary.best).toBe(0);
    expect(summary.mean).toBe(0);
    expect(summary.lossPct).toBe(0);
    expect(summary.repCount).toBe(0);
  });
});
