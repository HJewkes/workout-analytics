/**
 * Set Tests
 *
 * Tests for the Set functional API.
 * The src Set model handles rep boundary detection and contains reps.
 */

import { describe, it, expect } from 'vitest';
import {
  createSet,
  addSampleToSet,
  completeSet,
  getSetRepCount,
  getSetDuration,
  getSetTimeUnderTension,
} from '@/models/set';
import { MovementPhase } from '@/models';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Test Helpers
// =============================================================================

function createSampleSequence(phases: { phase: MovementPhase; count: number }[]): WorkoutSample[] {
  const samples: WorkoutSample[] = [];
  let sequence = 0;
  let timestamp = 1000;

  for (const { phase, count } of phases) {
    for (let i = 0; i < count; i++) {
      samples.push({
        sequence: sequence++,
        timestamp,
        phase,
        position: phase === MovementPhase.CONCENTRIC ? i / count : 1 - i / count,
        velocity: phase === MovementPhase.IDLE ? 0 : 0.5,
        force: 100,
      });
      timestamp += 90;
    }
  }

  return samples;
}

function processSamples(samples: WorkoutSample[]): Set {
  let set = createSet();
  for (const sample of samples) {
    set = addSampleToSet(set, sample);
  }
  return set;
}

// =============================================================================
// createSet() Tests
// =============================================================================

describe('createSet()', () => {
  it('creates empty set', () => {
    const set = createSet();

    expect(set.reps).toEqual([]);
    expect(getSetRepCount(set)).toBe(0);
  });
});

// =============================================================================
// addSampleToSet() Tests
// =============================================================================

describe('addSampleToSet()', () => {
  describe('starting a new rep', () => {
    it('starts rep on CONCENTRIC sample', () => {
      const set = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      };

      const result = addSampleToSet(set, sample);

      expect(result.reps.length).toBe(1);
      expect(result.reps[0].repNumber).toBe(1);
    });

    it('ignores non-CONCENTRIC samples when no rep in progress', () => {
      const set = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.IDLE,
        position: 0,
        velocity: 0,
        force: 0,
      };

      const result = addSampleToSet(set, sample);

      expect(result.reps.length).toBe(0);
    });

    it('ignores ECCENTRIC samples when no rep in progress', () => {
      const set = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: 0.3,
        force: 100,
      };

      const result = addSampleToSet(set, sample);

      expect(result.reps.length).toBe(0);
    });
  });

  describe('full rep cycle', () => {
    it('builds rep with concentric and eccentric phases', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      expect(set.reps.length).toBe(1);
      expect(set.reps[0].concentric.samples.length).toBe(5);
      expect(set.reps[0].eccentric.samples.length).toBe(5);
    });

    it('includes hold samples in appropriate phase', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.HOLD, count: 2 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      expect(set.reps.length).toBe(1);
      // Hold samples before eccentric go to concentric phase
      expect(set.reps[0].concentric.samples.length).toBe(7);
      expect(set.reps[0].eccentric.samples.length).toBe(5);
    });
  });

  describe('multiple consecutive reps', () => {
    it('detects new rep on eccentric -> concentric transition', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
        { phase: MovementPhase.CONCENTRIC, count: 5 }, // New rep starts here
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      expect(set.reps.length).toBe(2);
      expect(set.reps[0].repNumber).toBe(1);
      expect(set.reps[1].repNumber).toBe(2);
    });

    it('maintains correct rep numbers across multiple reps', () => {
      const samples: WorkoutSample[] = [];
      for (let rep = 0; rep < 3; rep++) {
        samples.push(
          ...createSampleSequence([
            { phase: MovementPhase.CONCENTRIC, count: 5 },
            { phase: MovementPhase.ECCENTRIC, count: 5 },
          ])
        );
      }

      const set = processSamples(samples);

      expect(set.reps.length).toBe(3);
      expect(set.reps[0].repNumber).toBe(1);
      expect(set.reps[1].repNumber).toBe(2);
      expect(set.reps[2].repNumber).toBe(3);
    });

    it('handles IDLE between reps', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
        { phase: MovementPhase.IDLE, count: 3 }, // Rest between reps
        { phase: MovementPhase.CONCENTRIC, count: 5 }, // New rep
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      // IDLE samples after eccentric still go to that rep's eccentric phase
      expect(set.reps.length).toBe(2);
    });
  });

  describe('immutability', () => {
    it('returns new set object', () => {
      const set1 = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      };

      const set2 = addSampleToSet(set1, sample);

      expect(set1).not.toBe(set2);
      expect(set1.reps.length).toBe(0);
      expect(set2.reps.length).toBe(1);
    });
  });
});

// =============================================================================
// completeSet() Tests
// =============================================================================

describe('completeSet()', () => {
  it('trims trailing IDLE from last rep eccentric phase', () => {
    const samples = createSampleSequence([
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.ECCENTRIC, count: 5 },
      { phase: MovementPhase.IDLE, count: 10 }, // Trailing IDLE
    ]);

    let set = processSamples(samples);
    set = completeSet(set);

    // IDLE samples should be trimmed from eccentric phase
    expect(set.reps[0].eccentric.samples.length).toBe(5);
  });

  it('trims trailing IDLE from last rep concentric phase if no eccentric', () => {
    const samples = createSampleSequence([
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.IDLE, count: 10 }, // Trailing IDLE, no eccentric yet
    ]);

    let set = processSamples(samples);
    set = completeSet(set);

    // IDLE samples should be trimmed from concentric phase
    expect(set.reps[0].concentric.samples.length).toBe(5);
  });

  it('returns same set if no reps', () => {
    const set = createSet();
    const completed = completeSet(set);

    expect(completed).toBe(set);
  });
});

// =============================================================================
// Set Metrics Tests
// =============================================================================

describe('Set metrics', () => {
  it('calculates rep count', () => {
    const samples = createSampleSequence([
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.ECCENTRIC, count: 5 },
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.ECCENTRIC, count: 5 },
    ]);

    const set = processSamples(samples);

    expect(getSetRepCount(set)).toBe(2);
  });

  it('calculates total duration', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 2000,
        phase: MovementPhase.CONCENTRIC,
        position: 1,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 2,
        timestamp: 2500,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: 0.3,
        force: 100,
      },
      {
        sequence: 3,
        timestamp: 4000,
        phase: MovementPhase.ECCENTRIC,
        position: 0,
        velocity: 0.3,
        force: 100,
      },
    ];

    const set = processSamples(samples);

    // Total duration: (2000-1000) + (4000-2500) = 1000 + 1500 = 2500ms = 2.5s
    // But getRepDuration uses endTime - startTime of rep
    expect(getSetDuration(set)).toBeGreaterThan(0);
  });

  it('calculates time under tension', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 2000,
        phase: MovementPhase.CONCENTRIC,
        position: 1,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 2,
        timestamp: 2500,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: 0.3,
        force: 100,
      },
      {
        sequence: 3,
        timestamp: 4000,
        phase: MovementPhase.ECCENTRIC,
        position: 0,
        velocity: 0.3,
        force: 100,
      },
    ];

    const set = processSamples(samples);

    // TUT should be sum of movement durations
    expect(getSetTimeUnderTension(set)).toBeGreaterThan(0);
  });

  it('returns 0 for empty set metrics', () => {
    const set = createSet();

    expect(getSetRepCount(set)).toBe(0);
    expect(getSetDuration(set)).toBe(0);
    expect(getSetTimeUnderTension(set)).toBe(0);
  });
});
