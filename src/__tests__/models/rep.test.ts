/**
 * Rep Tests
 *
 * Tests for rep creation and sample addition.
 * The src Rep model contains concentric and eccentric phases.
 */

import { describe, it, expect } from 'vitest';
import {
  createRep,
  addSampleToRep,
  isInEccentricPhase,
  getRepDuration,
  getRepTempo,
  getRepMeanVelocity,
  getRepPeakVelocity,
  getRepPeakForce,
  getRepRangeOfMotion,
  getRepSamples,
} from '@/models/rep';
import { getPhaseMeanVelocity } from '@/models/phase';
import { MovementPhase } from '@/models';
import type { WorkoutSample } from '@/models/sample';
import type { Rep } from '@/models/rep';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Build a rep from samples using the functional API.
 */
function buildRep(repNumber: number, samples: WorkoutSample[]): Rep {
  let rep = createRep(repNumber);
  for (const sample of samples) {
    rep = addSampleToRep(rep, sample);
  }
  return rep;
}

// =============================================================================
// createRep() Tests
// =============================================================================

describe('createRep()', () => {
  it('creates rep with correct rep number', () => {
    const rep = createRep(3);

    expect(rep.repNumber).toBe(3);
    expect(rep.concentric.samples).toEqual([]);
    expect(rep.eccentric.samples).toEqual([]);
  });

  it('starts with empty phases', () => {
    const rep = createRep(1);

    expect(rep.concentric.samples.length).toBe(0);
    expect(rep.eccentric.samples.length).toBe(0);
    expect(isInEccentricPhase(rep)).toBe(false);
  });
});

// =============================================================================
// addSampleToRep() Tests
// =============================================================================

describe('addSampleToRep()', () => {
  describe('phase assignment', () => {
    it('assigns CONCENTRIC samples to concentric phase', () => {
      let rep = createRep(1);
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      };

      rep = addSampleToRep(rep, sample);

      expect(rep.concentric.samples.length).toBe(1);
      expect(rep.eccentric.samples.length).toBe(0);
    });

    it('assigns ECCENTRIC samples to eccentric phase', () => {
      let rep = createRep(1);
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.ECCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      };

      rep = addSampleToRep(rep, sample);

      expect(rep.eccentric.samples.length).toBe(1);
      expect(isInEccentricPhase(rep)).toBe(true);
    });

    it('assigns HOLD samples to concentric phase before eccentric starts', () => {
      let rep = createRep(1);

      // Add concentric first
      rep = addSampleToRep(rep, {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      });

      // Then add hold - should go to concentric (top pause)
      rep = addSampleToRep(rep, {
        sequence: 1,
        timestamp: 1100,
        phase: MovementPhase.HOLD,
        position: 1,
        velocity: 0,
        force: 100,
      });

      expect(rep.concentric.samples.length).toBe(2);
      expect(rep.eccentric.samples.length).toBe(0);
    });

    it('assigns HOLD samples to eccentric phase after eccentric starts', () => {
      let rep = createRep(1);

      // First add eccentric
      rep = addSampleToRep(rep, {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.ECCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      });

      // Then add hold - should go to eccentric (bottom pause)
      rep = addSampleToRep(rep, {
        sequence: 1,
        timestamp: 1100,
        phase: MovementPhase.HOLD,
        position: 0,
        velocity: 0,
        force: 100,
      });

      expect(rep.eccentric.samples.length).toBe(2);
    });

    it('assigns IDLE samples to concentric phase before eccentric starts', () => {
      let rep = createRep(1);

      // Add concentric
      rep = addSampleToRep(rep, {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      });

      // Add IDLE - should go to concentric
      rep = addSampleToRep(rep, {
        sequence: 1,
        timestamp: 1100,
        phase: MovementPhase.IDLE,
        position: 0,
        velocity: 0,
        force: 0,
      });

      expect(rep.concentric.samples.length).toBe(2);
    });
  });

  describe('metrics computation', () => {
    it('computes duration from phases', () => {
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
          timestamp: 1800,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: 0.3,
          force: 100,
        },
        {
          sequence: 3,
          timestamp: 3500,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.3,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      // Total: 3500 - 1000 = 2500ms = 2.5s
      expect(getRepDuration(rep)).toBeCloseTo(2.5, 1);
    });

    it('computes concentric velocity from concentric phase', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.6,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1500,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.6,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: 0.35,
          force: 100,
        },
        {
          sequence: 3,
          timestamp: 3000,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.35,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      expect(getRepMeanVelocity(rep)).toBeCloseTo(0.6, 5);
    });

    it('computes eccentric velocity from eccentric phase', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.6,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1500,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.6,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: 0.35,
          force: 100,
        },
        {
          sequence: 3,
          timestamp: 3000,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.35,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      expect(getPhaseMeanVelocity(rep.eccentric)).toBeCloseTo(0.35, 5);
    });

    it('computes peak velocity from concentric phase', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.4,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1250,
          phase: MovementPhase.CONCENTRIC,
          position: 0.5,
          velocity: 0.8,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 1500,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.4,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      expect(getRepPeakVelocity(rep)).toBe(0.8);
    });

    it('computes peakForce from both phases', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.5,
          force: 200,
        },
        {
          sequence: 1,
          timestamp: 1500,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 150,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: 0.3,
          force: 180,
        },
        {
          sequence: 3,
          timestamp: 3000,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.3,
          force: 120,
        },
      ];
      const rep = buildRep(1, samples);

      expect(getRepPeakForce(rep)).toBe(200);
    });

    it('computes rangeOfMotion from concentric phase', () => {
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
          timestamp: 1500,
          phase: MovementPhase.CONCENTRIC,
          position: 0.95,
          velocity: 0.5,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.ECCENTRIC,
          position: 0.95,
          velocity: 0.3,
          force: 100,
        },
        {
          sequence: 3,
          timestamp: 3000,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.3,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      expect(getRepRangeOfMotion(rep)).toBe(0.95);
    });
  });

  describe('tempo formatting', () => {
    it('formats standard tempo correctly', () => {
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
          timestamp: 2100,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: 0.3,
          force: 100,
        },
        {
          sequence: 3,
          timestamp: 4100,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.3,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      // Format: "eccentric-topPause-concentric-bottomPause"
      // Concentric: 1s, Eccentric: 2s
      expect(getRepTempo(rep)).toBe('2-0-1-0');
    });
  });

  describe('sample collection', () => {
    it('collects all samples from both phases', () => {
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
          timestamp: 1500,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: 0.3,
          force: 100,
        },
        {
          sequence: 3,
          timestamp: 3000,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: 0.3,
          force: 100,
        },
      ];
      const rep = buildRep(1, samples);

      expect(getRepSamples(rep).length).toBe(4);
    });
  });

  describe('immutability', () => {
    it('returns new rep object', () => {
      const rep1 = createRep(1);
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0.5,
        velocity: 0.5,
        force: 100,
      };

      const rep2 = addSampleToRep(rep1, sample);

      expect(rep1).not.toBe(rep2);
      expect(rep1.concentric.samples.length).toBe(0);
      expect(rep2.concentric.samples.length).toBe(1);
    });
  });
});
