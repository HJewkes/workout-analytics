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
  getPhaseImpulse,
  getPhaseMeanPower,
  getPhaseTimeToPeakVelocityMs,
  getPhaseVelocityDropPct,
  getPhaseVelocityEnvelope,
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
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.HOLD,
          position: 1,
          velocity: 0,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1100,
          phase: MovementPhase.HOLD,
          position: 1,
          velocity: 0,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.HOLD,
          position: 1,
          velocity: 0,
          force: 100,
        },
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
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.IDLE,
          position: 0,
          velocity: 0,
          force: 0,
        },
        {
          sequence: 1,
          timestamp: 1100,
          phase: MovementPhase.IDLE,
          position: 0,
          velocity: 0,
          force: 0,
        },
      ];
      const phase = buildPhase(idleSamples);

      expect(getPhaseMeanVelocity(phase)).toBe(0);
      expect(getPhaseMeanForce(phase)).toBe(0);
    });
  });

  describe('duration calculation', () => {
    it('calculates duration in seconds', () => {
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
          position: 0.5,
          velocity: 0.7,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 100,
        },
      ];
      const phase = buildPhase(samples);

      expect(getPhaseDuration(phase)).toBe(1); // 2000 - 1000 = 1000ms = 1s
    });

    it('returns 0 for single sample', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.5,
          force: 100,
        },
      ];
      const phase = buildPhase(samples);

      expect(getPhaseDuration(phase)).toBe(0);
    });

    it('calculates movement duration excluding holds', () => {
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
          phase: MovementPhase.HOLD,
          position: 0.5,
          velocity: 0,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 2000,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 100,
        },
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
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.2,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1100,
          phase: MovementPhase.CONCENTRIC,
          position: 0.5,
          velocity: 0.6,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.4,
          force: 100,
        },
      ];
      const phase = buildPhase(samples);

      // Mean of 0.2, 0.6, 0.4 = 0.4
      expect(getPhaseMeanVelocity(phase)).toBeCloseTo(0.4, 5);
    });

    it('calculates peak velocity', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0,
          velocity: 0.2,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1100,
          phase: MovementPhase.CONCENTRIC,
          position: 0.5,
          velocity: 0.8,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.4,
          force: 100,
        },
      ];
      const phase = buildPhase(samples);

      expect(phase.peakVelocity).toBe(0.8);
    });

    // Regression: SDK 0.6.0 made device velocity signed (eccentric < 0).
    // WorkoutSample.velocity is contracted as magnitude, but a buggy adapter
    // could forward the signed value. Phase aggregation must normalize via
    // Math.abs so peak velocity is not silently zeroed by Math.max(0, -x).
    it('normalizes signed velocity to magnitude (defensive)', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.ECCENTRIC,
          position: 1,
          velocity: -0.3, // signed input from buggy adapter
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1100,
          phase: MovementPhase.ECCENTRIC,
          position: 0.5,
          velocity: -1.2, // peak (magnitude)
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.ECCENTRIC,
          position: 0,
          velocity: -0.6,
          force: 100,
        },
      ];
      const phase = buildPhase(samples);

      // Without Math.abs hardening, peakVelocity would be 0 (Math.max(0, -1.2) === 0)
      expect(phase.peakVelocity).toBeCloseTo(1.2, 5);
      // Mean is the magnitude-mean: (0.3 + 1.2 + 0.6) / 3 = 0.7
      expect(getPhaseMeanVelocity(phase)).toBeCloseTo(0.7, 5);
    });
  });

  describe('force calculations', () => {
    it('calculates mean force', () => {
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
          timestamp: 1100,
          phase: MovementPhase.CONCENTRIC,
          position: 0.5,
          velocity: 0.5,
          force: 150,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 200,
        },
      ];
      const phase = buildPhase(samples);

      // Mean of 100, 150, 200 = 150
      expect(getPhaseMeanForce(phase)).toBe(150);
    });

    it('calculates peak force', () => {
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
          timestamp: 1100,
          phase: MovementPhase.CONCENTRIC,
          position: 0.5,
          velocity: 0.5,
          force: 250,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.CONCENTRIC,
          position: 1,
          velocity: 0.5,
          force: 150,
        },
      ];
      const phase = buildPhase(samples);

      expect(phase.peakForce).toBe(250);
    });
  });

  describe('position tracking', () => {
    it('captures start and end positions', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0.1,
          velocity: 0.5,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1100,
          phase: MovementPhase.CONCENTRIC,
          position: 0.5,
          velocity: 0.5,
          force: 100,
        },
        {
          sequence: 2,
          timestamp: 1200,
          phase: MovementPhase.CONCENTRIC,
          position: 0.9,
          velocity: 0.5,
          force: 100,
        },
      ];
      const phase = buildPhase(samples);

      expect(phase.startPosition).toBe(0.1);
      expect(phase.endPosition).toBe(0.9);
    });

    it('calculates range of motion', () => {
      const samples: WorkoutSample[] = [
        {
          sequence: 0,
          timestamp: 1000,
          phase: MovementPhase.CONCENTRIC,
          position: 0.1,
          velocity: 0.5,
          force: 100,
        },
        {
          sequence: 1,
          timestamp: 1200,
          phase: MovementPhase.CONCENTRIC,
          position: 0.9,
          velocity: 0.5,
          force: 100,
        },
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

// =============================================================================
// Telemetry-enrichment helpers (impulse, meanPower, timeToPeakVelocity,
// velocityDropPct, velocityEnvelope)
// =============================================================================

describe('getPhaseImpulse()', () => {
  it('returns 0 for an empty phase', () => {
    expect(getPhaseImpulse(EMPTY_PHASE)).toBe(0);
  });

  it('returns 0 when all samples are hold/idle (no movement duration)', () => {
    const holds: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.HOLD,
        position: 0,
        velocity: 0,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 1500,
        phase: MovementPhase.HOLD,
        position: 0,
        velocity: 0,
        force: 100,
      },
    ];
    const phase = buildPhase(holds);
    expect(getPhaseImpulse(phase)).toBe(0);
  });

  it('equals meanForce × movementDuration', () => {
    const samples = createConcentricSamples(10, { baseForce: 200 });
    const phase = buildPhase(samples);
    const expected = getPhaseMeanForce(phase) * getPhaseMovementDuration(phase);
    expect(getPhaseImpulse(phase)).toBeCloseTo(expected, 6);
  });

  it('scales with force when movement duration is held constant', () => {
    const light = buildPhase(createConcentricSamples(10, { baseForce: 100 }));
    const heavy = buildPhase(createConcentricSamples(10, { baseForce: 300 }));
    expect(getPhaseImpulse(heavy)).toBeGreaterThan(getPhaseImpulse(light) * 2);
  });
});

describe('getPhaseMeanPower()', () => {
  it('returns 0 for an empty phase', () => {
    expect(getPhaseMeanPower(EMPTY_PHASE)).toBe(0);
  });

  it('equals mean(|velocity| × force) over movement samples', () => {
    const samples: WorkoutSample[] = [
      // Three movement samples with known F, V so the mean is hand-checkable.
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
        timestamp: 1100,
        phase: MovementPhase.CONCENTRIC,
        position: 0.1,
        velocity: 0.7,
        force: 200,
      },
      {
        sequence: 2,
        timestamp: 1200,
        phase: MovementPhase.CONCENTRIC,
        position: 0.2,
        velocity: 0.3,
        force: 150,
      },
    ];
    const phase = buildPhase(samples);
    // (0.5*100 + 0.7*200 + 0.3*150) / 3 = (50 + 140 + 45) / 3 = 235 / 3
    expect(getPhaseMeanPower(phase)).toBeCloseTo(235 / 3, 6);
  });

  it('excludes hold/idle samples from the mean', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 1,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 1100,
        phase: MovementPhase.HOLD,
        position: 0.1,
        velocity: 0,
        force: 100,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseMeanPower(phase)).toBe(100); // movement sample only
  });

  it('uses |velocity| so a negative-signed sample still contributes positively', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: -0.5,
        force: 100,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseMeanPower(phase)).toBe(50);
  });
});

describe('getPhaseTimeToPeakVelocityMs()', () => {
  it('returns 0 for an empty phase', () => {
    expect(getPhaseTimeToPeakVelocityMs(EMPTY_PHASE)).toBe(0);
  });

  it('returns ms from phase start to the sample where peak velocity was set', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.2,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 1150,
        phase: MovementPhase.CONCENTRIC,
        position: 0.1,
        velocity: 0.9, // peak here
        force: 110,
      },
      {
        sequence: 2,
        timestamp: 1300,
        phase: MovementPhase.CONCENTRIC,
        position: 0.2,
        velocity: 0.5,
        force: 120,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseTimeToPeakVelocityMs(phase)).toBe(150); // 1150 - 1000
  });

  it('retains the first peak when a later sample ties (strictly-greater semantics)', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.8,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 1200,
        phase: MovementPhase.CONCENTRIC,
        position: 0.1,
        velocity: 0.8, // ties — original sample wins
        force: 110,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseTimeToPeakVelocityMs(phase)).toBe(0); // peak at startTime
  });
});

describe('getPhaseVelocityDropPct()', () => {
  it('returns 0 when peak velocity is 0 (all-hold phase or empty)', () => {
    expect(getPhaseVelocityDropPct(EMPTY_PHASE)).toBe(0);
  });

  it('returns 0 when the phase ended at peak velocity (no slowdown)', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.3,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 1100,
        phase: MovementPhase.CONCENTRIC,
        position: 0.1,
        velocity: 0.9, // peak AND end velocity match
        force: 110,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseVelocityDropPct(phase)).toBe(0);
  });

  it('reports the percentage drop from peak to last movement sample', () => {
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
        timestamp: 1100,
        phase: MovementPhase.CONCENTRIC,
        position: 0.1,
        velocity: 1.0, // peak
        force: 110,
      },
      {
        sequence: 2,
        timestamp: 1200,
        phase: MovementPhase.CONCENTRIC,
        position: 0.2,
        velocity: 0.6, // end — 40% below peak
        force: 120,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseVelocityDropPct(phase)).toBeCloseTo(40, 6);
  });

  it('ignores a trailing hold sample (keeps the last movement velocity)', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 1.0,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 1100,
        phase: MovementPhase.CONCENTRIC,
        position: 0.1,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 2,
        timestamp: 1200,
        phase: MovementPhase.HOLD,
        position: 0.1,
        velocity: 0, // would compute 100% drop if not filtered
        force: 100,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseVelocityDropPct(phase)).toBeCloseTo(50, 6);
  });
});

describe('getPhaseVelocityEnvelope()', () => {
  it('returns [0,0,0,0] for an empty phase', () => {
    expect(getPhaseVelocityEnvelope(EMPTY_PHASE)).toEqual([0, 0, 0, 0]);
  });

  it('returns [0,0,0,0] for a single-sample phase (envelope undefined)', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 1,
        force: 100,
      },
    ];
    const phase = buildPhase(samples);
    expect(getPhaseVelocityEnvelope(phase)).toEqual([0, 0, 0, 0]);
  });

  it('samples velocity at 25/50/75/100% of the movement span', () => {
    // Uniform 100ms-spaced ramp from velocity 0.1 → 1.0 in 10 samples.
    // Movement span = 900ms (1900 − 1000). Nearest-neighbour from target
    // times 1225 / 1450 / 1675 / 1900 picks samples at t=1200 / 1400 /
    // 1700 / 1900 → velocities 0.3 / 0.5 / 0.8 / 1.0. (The 75% target is
    // closer to t=1700 than t=1600 — delta 25 vs 75 — so the envelope's
    // third entry is 0.8, not 0.7. This is the nearest-neighbour bias
    // we accept in exchange for an O(N) single-pass implementation.)
    const samples: WorkoutSample[] = Array.from({ length: 10 }, (_, i) => ({
      sequence: i,
      timestamp: 1000 + i * 100,
      phase: MovementPhase.CONCENTRIC,
      position: i * 0.1,
      velocity: 0.1 + i * 0.1,
      force: 100,
    }));
    const phase = buildPhase(samples);
    const env = getPhaseVelocityEnvelope(phase);
    expect(env).toHaveLength(4);
    expect(env[0]).toBeCloseTo(0.3, 1);
    expect(env[1]).toBeCloseTo(0.5, 1);
    expect(env[2]).toBeCloseTo(0.8, 1);
    expect(env[3]).toBeCloseTo(1.0, 1);
  });

  it('excludes hold/idle samples from the envelope span', () => {
    // 5 movement samples followed by an idle sample at the end. The
    // envelope's 100% point should be the last MOVEMENT sample, not the
    // idle one (else the curve gets dragged toward zero velocity).
    const samples: WorkoutSample[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        sequence: i,
        timestamp: 1000 + i * 100,
        phase: MovementPhase.CONCENTRIC,
        position: i * 0.1,
        velocity: 0.2 + i * 0.2,
        force: 100,
      })),
      {
        sequence: 5,
        timestamp: 1500,
        phase: MovementPhase.IDLE,
        position: 0.4,
        velocity: 0,
        force: 100,
      },
    ];
    const phase = buildPhase(samples);
    const env = getPhaseVelocityEnvelope(phase);
    expect(env[3]).toBeCloseTo(1.0, 1); // last movement sample, not idle 0
  });

  it('reports |velocity| so a signed eccentric sample still contributes positively', () => {
    const samples: WorkoutSample[] = Array.from({ length: 4 }, (_, i) => ({
      sequence: i,
      timestamp: 1000 + i * 100,
      phase: MovementPhase.ECCENTRIC,
      position: 1 - i * 0.1,
      velocity: -(0.2 + i * 0.2),
      force: 100,
    }));
    const phase = buildPhase(samples);
    const env = getPhaseVelocityEnvelope(phase);
    expect(env.every((v) => v >= 0)).toBe(true);
  });
});
