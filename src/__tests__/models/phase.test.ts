/**
 * Phase Tests
 *
 * Tests for phase creation and sample addition.
 * The src Phase model uses running aggregates for O(1) metrics.
 */

import { describe, it, expect } from 'vitest';
import {
  EMPTY_PHASE,
  addSampleToPhase,
  getPhaseDuration,
  getPhaseHoldDuration,
  getPhaseMovementDuration,
  getPhaseMeanVelocity,
  getPhaseMeanForce,
  getPhaseRangeOfMotion,
} from '@/models/phase';
import { MovementPhase } from '@/models';
import type { WorkoutSample } from '@/models/sample';
import type { Phase } from '@/models/phase';

// =============================================================================
// Test Helpers
// =============================================================================

function createConcentricSamples(
  count: number,
  options: {
    startTime?: number;
    peakVelocity?: number;
    baseForce?: number;
  } = {}
) {
  const { startTime = 1000, peakVelocity = 0.7, baseForce = 150 } = options;
  const samples: WorkoutSample[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / count;
    const timestamp = startTime + i * 90; // ~11Hz
    const position = progress;
    // Velocity follows sine curve (ramps up then down)
    const velocity = Math.sin(progress * Math.PI) * peakVelocity;
    const force = baseForce * (1 - progress * 0.3);

    samples.push({
      sequence: i,
      timestamp,
      phase: MovementPhase.CONCENTRIC,
      position,
      velocity,
      force,
    });
  }

  return samples;
}

function createEccentricSamples(
  count: number,
  options: {
    startTime?: number;
    peakVelocity?: number;
    baseForce?: number;
    startSequence?: number;
  } = {}
) {
  const { startTime = 1000, peakVelocity = 0.4, baseForce = 120, startSequence = 0 } = options;
  const samples: WorkoutSample[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / count;
    const timestamp = startTime + i * 90;
    const position = 1 - progress; // Goes from 1 to 0
    const velocity = Math.sin(progress * Math.PI) * peakVelocity;
    const force = baseForce * (1 - progress * 0.2);

    samples.push({
      sequence: startSequence + i,
      timestamp,
      phase: MovementPhase.ECCENTRIC,
      position,
      velocity,
      force,
    });
  }

  return samples;
}

/**
 * Build a phase from samples using the functional API.
 */
function buildPhase(samples: WorkoutSample[]): Phase {
  let phase = EMPTY_PHASE;
  for (const sample of samples) {
    phase = addSampleToPhase(phase, sample);
  }
  return phase;
}

// =============================================================================
// EMPTY_PHASE Tests
// =============================================================================

describe('EMPTY_PHASE', () => {
  it('has correct default values', () => {
    expect(EMPTY_PHASE.samples).toEqual([]);
    expect(EMPTY_PHASE.startTime).toBe(0);
    expect(EMPTY_PHASE.endTime).toBe(0);
    expect(EMPTY_PHASE.startPosition).toBe(0);
    expect(EMPTY_PHASE.endPosition).toBe(0);
    expect(EMPTY_PHASE.peakVelocity).toBe(0);
    expect(EMPTY_PHASE.peakForce).toBe(0);
  });

  it('returns 0 for all derived metrics', () => {
    expect(getPhaseDuration(EMPTY_PHASE)).toBe(0);
    expect(getPhaseMeanVelocity(EMPTY_PHASE)).toBe(0);
    expect(getPhaseMeanForce(EMPTY_PHASE)).toBe(0);
  });
});

// =============================================================================
// addSampleToPhase() Tests
// =============================================================================

describe('addSampleToPhase()', () => {
  describe('with valid samples', () => {
    it('adds sample to phase', () => {
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      };

      const phase = addSampleToPhase(EMPTY_PHASE, sample);

      expect(phase.samples.length).toBe(1);
      expect(phase.startTime).toBe(1000);
      expect(phase.endTime).toBe(1000);
    });

    it('captures timestamp range from samples', () => {
      const samples = createConcentricSamples(10, { startTime: 5000 });
      const phase = buildPhase(samples);

      expect(phase.startTime).toBe(samples[0].timestamp);
      expect(phase.endTime).toBe(samples[samples.length - 1].timestamp);
    });

    it('includes all samples', () => {
      const samples = createConcentricSamples(15);
      const phase = buildPhase(samples);

      expect(phase.samples.length).toBe(15);
    });

    it('computes metrics correctly', () => {
      const samples = createConcentricSamples(10, { peakVelocity: 0.8, baseForce: 200 });
      const phase = buildPhase(samples);

      expect(getPhaseDuration(phase)).toBeGreaterThan(0);
      expect(getPhaseMeanVelocity(phase)).toBeGreaterThan(0);
      expect(phase.peakVelocity).toBeGreaterThan(0);
      expect(getPhaseMeanForce(phase)).toBeGreaterThan(0);
      expect(phase.peakForce).toBeGreaterThan(0);
    });
  });

  describe('with different sample types', () => {
    it('handles ECCENTRIC samples', () => {
      const samples = createEccentricSamples(10);
      const phase = buildPhase(samples);

      expect(phase.startPosition).toBe(1); // Starts at top
      expect(phase.endPosition).toBeLessThan(1); // Ends lower
    });

    it('handles HOLD samples as pauses', () => {
      const holdSamples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.HOLD, position: 1, velocity: 0, force: 100 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.HOLD, position: 1, velocity: 0, force: 100 },
        { sequence: 2, timestamp: 1200, phase: MovementPhase.HOLD, position: 1, velocity: 0, force: 100 },
      ];
      const phase = buildPhase(holdSamples);

      // HOLD samples don't contribute to movement metrics
      expect(getPhaseMeanVelocity(phase)).toBe(0);
      expect(phase.startPosition).toBe(1);
      expect(phase.endPosition).toBe(1);
      // But they do contribute to hold duration
      expect(getPhaseHoldDuration(phase)).toBeGreaterThan(0);
    });

    it('handles IDLE samples as pauses', () => {
      const idleSamples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.IDLE, position: 0, velocity: 0, force: 0 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.IDLE, position: 0, velocity: 0, force: 0 },
      ];
      const phase = buildPhase(idleSamples);

      expect(getPhaseMeanVelocity(phase)).toBe(0);
      expect(getPhaseMeanForce(phase)).toBe(0);
    });
  });

  describe('duration calculation', () => {
    it('calculates duration in seconds', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.5, force: 100 },
        { sequence: 1, timestamp: 1500, phase: MovementPhase.CONCENTRIC, position: 0.5, velocity: 0.7, force: 100 },
        { sequence: 2, timestamp: 2000, phase: MovementPhase.CONCENTRIC, position: 1, velocity: 0.5, force: 100 },
      ];
      const phase = buildPhase(samples);

      expect(getPhaseDuration(phase)).toBe(1); // 2000 - 1000 = 1000ms = 1s
    });

    it('returns 0 for single sample', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.5, force: 100 },
      ];
      const phase = buildPhase(samples);

      expect(getPhaseDuration(phase)).toBe(0);
    });

    it('calculates movement duration excluding holds', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.5, force: 100 },
        { sequence: 1, timestamp: 1500, phase: MovementPhase.HOLD, position: 0.5, velocity: 0, force: 100 },
        { sequence: 2, timestamp: 2000, phase: MovementPhase.CONCENTRIC, position: 1, velocity: 0.5, force: 100 },
      ];
      const phase = buildPhase(samples);

      const totalDuration = getPhaseDuration(phase);
      const holdDuration = getPhaseHoldDuration(phase);
      const movementDuration = getPhaseMovementDuration(phase);

      expect(totalDuration).toBe(1); // 1 second total
      expect(holdDuration).toBe(0.5); // 500ms hold
      expect(movementDuration).toBe(0.5); // 500ms movement
    });
  });

  describe('velocity calculations', () => {
    it('calculates mean velocity', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.2, force: 100 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.CONCENTRIC, position: 0.5, velocity: 0.6, force: 100 },
        { sequence: 2, timestamp: 1200, phase: MovementPhase.CONCENTRIC, position: 1, velocity: 0.4, force: 100 },
      ];
      const phase = buildPhase(samples);

      // Mean of 0.2, 0.6, 0.4 = 0.4
      expect(getPhaseMeanVelocity(phase)).toBeCloseTo(0.4, 5);
    });

    it('calculates peak velocity', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.2, force: 100 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.CONCENTRIC, position: 0.5, velocity: 0.8, force: 100 },
        { sequence: 2, timestamp: 1200, phase: MovementPhase.CONCENTRIC, position: 1, velocity: 0.4, force: 100 },
      ];
      const phase = buildPhase(samples);

      expect(phase.peakVelocity).toBe(0.8);
    });
  });

  describe('force calculations', () => {
    it('calculates mean force', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.5, force: 100 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.CONCENTRIC, position: 0.5, velocity: 0.5, force: 150 },
        { sequence: 2, timestamp: 1200, phase: MovementPhase.CONCENTRIC, position: 1, velocity: 0.5, force: 200 },
      ];
      const phase = buildPhase(samples);

      // Mean of 100, 150, 200 = 150
      expect(getPhaseMeanForce(phase)).toBe(150);
    });

    it('calculates peak force', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.5, force: 100 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.CONCENTRIC, position: 0.5, velocity: 0.5, force: 250 },
        { sequence: 2, timestamp: 1200, phase: MovementPhase.CONCENTRIC, position: 1, velocity: 0.5, force: 150 },
      ];
      const phase = buildPhase(samples);

      expect(phase.peakForce).toBe(250);
    });
  });

  describe('position tracking', () => {
    it('captures start and end positions', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0.1, velocity: 0.5, force: 100 },
        { sequence: 1, timestamp: 1100, phase: MovementPhase.CONCENTRIC, position: 0.5, velocity: 0.5, force: 100 },
        { sequence: 2, timestamp: 1200, phase: MovementPhase.CONCENTRIC, position: 0.9, velocity: 0.5, force: 100 },
      ];
      const phase = buildPhase(samples);

      expect(phase.startPosition).toBe(0.1);
      expect(phase.endPosition).toBe(0.9);
    });

    it('calculates range of motion', () => {
      const samples: WorkoutSample[] = [
        { sequence: 0, timestamp: 1000, phase: MovementPhase.CONCENTRIC, position: 0.1, velocity: 0.5, force: 100 },
        { sequence: 1, timestamp: 1200, phase: MovementPhase.CONCENTRIC, position: 0.9, velocity: 0.5, force: 100 },
      ];
      const phase = buildPhase(samples);

      expect(getPhaseRangeOfMotion(phase)).toBeCloseTo(0.8, 5);
    });
  });

  describe('immutability', () => {
    it('returns new phase object', () => {
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      };

      const phase2 = addSampleToPhase(EMPTY_PHASE, sample);

      expect(EMPTY_PHASE).not.toBe(phase2);
      expect(EMPTY_PHASE.samples.length).toBe(0);
      expect(phase2.samples.length).toBe(1);
    });
  });
});
