/**
 * Rep Analytics Tests
 *
 * Tests for first-order rep analytics functions.
 */

import { describe, it, expect } from 'vitest';
import {
  getRepMeanEccentricVelocity,
  getRepMeanConcentricForce,
  getRepPeakConcentricForce,
  getRepMeanEccentricForce,
  getRepPeakEccentricForce,
  getRepConcentricTime,
  getRepEccentricTime,
  getRepImpulse,
  getRepWork,
  getRepConcentricImpulse,
  getRepEccentricImpulse,
  getRepTotalImpulse,
  getRepConcentricWork,
  getRepEccentricWork,
  getRepTotalWork,
  getRepMeanConcentricPower,
  getRepMeanEccentricPower,
} from '@/analytics/rep-analytics';
import { createRep, addSampleToRep } from '@/models/rep';
import { MovementPhase } from '@/models/types';
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

/**
 * Create a simple rep with known values for testing.
 */
function createTestRep(): Rep {
  const samples: WorkoutSample[] = [
    // Concentric phase: 1 second, velocity 0.5, force 100N
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
      velocity: 0.5,
      force: 100,
    },
    {
      sequence: 2,
      timestamp: 2000,
      phase: MovementPhase.CONCENTRIC,
      position: 1.0,
      velocity: 0.5,
      force: 100,
    },
    // Eccentric phase: 2 seconds, velocity 0.25, force 80N
    {
      sequence: 3,
      timestamp: 2500,
      phase: MovementPhase.ECCENTRIC,
      position: 1.0,
      velocity: 0.25,
      force: 80,
    },
    {
      sequence: 4,
      timestamp: 3500,
      phase: MovementPhase.ECCENTRIC,
      position: 0.5,
      velocity: 0.25,
      force: 80,
    },
    {
      sequence: 5,
      timestamp: 4500,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: 0.25,
      force: 80,
    },
  ];
  return buildRep(1, samples);
}

/**
 * Create a rep with varying force for impulse/work tests.
 */
function createVaryingForceRep(): Rep {
  const samples: WorkoutSample[] = [
    // Concentric: force increases then decreases
    {
      sequence: 0,
      timestamp: 1000,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity: 0.5,
      force: 50,
    },
    {
      sequence: 1,
      timestamp: 1500,
      phase: MovementPhase.CONCENTRIC,
      position: 0.25,
      velocity: 0.5,
      force: 100,
    },
    {
      sequence: 2,
      timestamp: 2000,
      phase: MovementPhase.CONCENTRIC,
      position: 0.5,
      velocity: 0.5,
      force: 150,
    },
    {
      sequence: 3,
      timestamp: 2500,
      phase: MovementPhase.CONCENTRIC,
      position: 0.75,
      velocity: 0.5,
      force: 100,
    },
    {
      sequence: 4,
      timestamp: 3000,
      phase: MovementPhase.CONCENTRIC,
      position: 1.0,
      velocity: 0.5,
      force: 50,
    },
    // Eccentric
    {
      sequence: 5,
      timestamp: 3500,
      phase: MovementPhase.ECCENTRIC,
      position: 1.0,
      velocity: 0.25,
      force: 60,
    },
    {
      sequence: 6,
      timestamp: 4500,
      phase: MovementPhase.ECCENTRIC,
      position: 0.5,
      velocity: 0.25,
      force: 60,
    },
    {
      sequence: 7,
      timestamp: 5500,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: 0.25,
      force: 60,
    },
  ];
  return buildRep(1, samples);
}

/**
 * Create an empty rep (no samples).
 */
function createEmptyRep(): Rep {
  return createRep(1);
}

// =============================================================================
// Velocity Analytics Tests
// =============================================================================

describe('getRepMeanEccentricVelocity()', () => {
  it('returns mean eccentric velocity', () => {
    const rep = createTestRep();
    expect(getRepMeanEccentricVelocity(rep)).toBeCloseTo(0.25, 5);
  });

  it('returns 0 for rep with no eccentric phase', () => {
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
    ];
    const rep = buildRep(1, samples);
    expect(getRepMeanEccentricVelocity(rep)).toBe(0);
  });
});

// =============================================================================
// Force Analytics Tests
// =============================================================================

describe('getRepMeanConcentricForce()', () => {
  it('returns mean concentric force', () => {
    const rep = createTestRep();
    expect(getRepMeanConcentricForce(rep)).toBeCloseTo(100, 5);
  });

  it('returns 0 for empty rep', () => {
    expect(getRepMeanConcentricForce(createEmptyRep())).toBe(0);
  });
});

describe('getRepPeakConcentricForce()', () => {
  it('returns peak concentric force', () => {
    const rep = createVaryingForceRep();
    expect(getRepPeakConcentricForce(rep)).toBe(150);
  });

  it('returns 0 for empty rep', () => {
    expect(getRepPeakConcentricForce(createEmptyRep())).toBe(0);
  });
});

describe('getRepMeanEccentricForce()', () => {
  it('returns mean eccentric force', () => {
    const rep = createTestRep();
    expect(getRepMeanEccentricForce(rep)).toBeCloseTo(80, 5);
  });
});

describe('getRepPeakEccentricForce()', () => {
  it('returns peak eccentric force', () => {
    const rep = createTestRep();
    expect(getRepPeakEccentricForce(rep)).toBe(80);
  });
});

// =============================================================================
// Timing Analytics Tests
// =============================================================================

describe('getRepConcentricTime()', () => {
  it('returns concentric movement duration', () => {
    const rep = createTestRep();
    // 1000ms to 2000ms = 1 second
    expect(getRepConcentricTime(rep)).toBeCloseTo(1.0, 1);
  });

  it('returns 0 for empty rep', () => {
    expect(getRepConcentricTime(createEmptyRep())).toBe(0);
  });
});

describe('getRepEccentricTime()', () => {
  it('returns eccentric movement duration', () => {
    const rep = createTestRep();
    // 2500ms to 4500ms = 2 seconds
    expect(getRepEccentricTime(rep)).toBeCloseTo(2.0, 1);
  });

  it('returns 0 for rep with no eccentric', () => {
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
    const rep = buildRep(1, samples);
    expect(getRepEccentricTime(rep)).toBe(0);
  });
});

// =============================================================================
// Impulse Analytics Tests
// =============================================================================

describe('getRepImpulse()', () => {
  it('computes impulse for constant force', () => {
    const rep = createTestRep();
    // Concentric: 100 lbs × 1s = 100 lbs·s
    expect(getRepImpulse(rep)).toBeCloseTo(100, 0);
  });

  it('computes impulse for varying force using trapezoidal rule', () => {
    const rep = createVaryingForceRep();
    // Segments: 0.5s each
    // Segment 1: (50+100)/2 × 0.5 = 37.5
    // Segment 2: (100+150)/2 × 0.5 = 62.5
    // Segment 3: (150+100)/2 × 0.5 = 62.5
    // Segment 4: (100+50)/2 × 0.5 = 37.5
    // Total: 200 lbs·s
    expect(getRepImpulse(rep)).toBeCloseTo(200, 0);
  });

  it('returns 0 for rep with less than 2 samples', () => {
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
    const rep = buildRep(1, samples);
    expect(getRepImpulse(rep)).toBe(0);
  });
});

describe('getRepConcentricImpulse()', () => {
  it('is an alias for getRepImpulse', () => {
    const rep = createTestRep();
    expect(getRepConcentricImpulse(rep)).toBe(getRepImpulse(rep));
  });
});

describe('getRepEccentricImpulse()', () => {
  it('computes eccentric impulse', () => {
    const rep = createTestRep();
    // Eccentric: 80 lbs × 2s = 160 lbs·s
    expect(getRepEccentricImpulse(rep)).toBeCloseTo(160, 0);
  });
});

// =============================================================================
// Work Analytics Tests
// =============================================================================

describe('getRepWork()', () => {
  it('computes work for constant force', () => {
    const rep = createTestRep();
    // Concentric: 100 lbs × 1 (position-unit) = 100 lbs·position
    expect(getRepWork(rep)).toBeCloseTo(100, 0);
  });

  it('computes work for varying force', () => {
    const rep = createVaryingForceRep();
    // Position moves from 0 to 1 in 0.25 increments
    // Segment 1: (50+100)/2 × 0.25 = 18.75
    // Segment 2: (100+150)/2 × 0.25 = 31.25
    // Segment 3: (150+100)/2 × 0.25 = 31.25
    // Segment 4: (100+50)/2 × 0.25 = 18.75
    // Total: 100 lbs·position
    expect(getRepWork(rep)).toBeCloseTo(100, 0);
  });

  it('returns 0 for rep with less than 2 samples', () => {
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
    const rep = buildRep(1, samples);
    expect(getRepWork(rep)).toBe(0);
  });
});

describe('getRepConcentricWork()', () => {
  it('is an alias for getRepWork', () => {
    const rep = createTestRep();
    expect(getRepConcentricWork(rep)).toBe(getRepWork(rep));
  });
});

describe('getRepEccentricWork()', () => {
  it('computes eccentric work', () => {
    const rep = createTestRep();
    // Eccentric: 80 lbs × 1 (position-unit) = 80 lbs·position
    expect(getRepEccentricWork(rep)).toBeCloseTo(80, 0);
  });
});

// =============================================================================
// Power Analytics Tests
// =============================================================================

describe('getRepMeanConcentricPower()', () => {
  it('computes mean power (work / time)', () => {
    const rep = createTestRep();
    // Work: 100 lbs·position, Time: 1 s → Power: 100 lbs·position/s
    expect(getRepMeanConcentricPower(rep)).toBeCloseTo(100, 0);
  });

  it('returns 0 when time is 0', () => {
    expect(getRepMeanConcentricPower(createEmptyRep())).toBe(0);
  });
});

describe('getRepMeanEccentricPower()', () => {
  it('computes mean eccentric power', () => {
    const rep = createTestRep();
    // Work: 80 J, Time: 2 s → Power: 40 W
    expect(getRepMeanEccentricPower(rep)).toBeCloseTo(40, 0);
  });
});

// =============================================================================
// Force-Unit Contract Tests
//
// WorkoutSample.force is contracted as lbs (NOT tenths-of-lbs). SDK 0.6.0
// device frames report force as uint16 tenths; an adapter that forwards the
// raw value without /10 inflates these integrals 10x. These tests pin the
// expected output magnitude given known lbs input — failing loudly if the
// math ever drifts and serving as documentation for the unit contract.
// =============================================================================

describe('force-unit contract (lbs in → lbs·s, lbs·m out)', () => {
  function buildConstantForceRep(forceLbs: number): Rep {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: forceLbs,
      },
      {
        sequence: 1,
        timestamp: 2000,
        phase: MovementPhase.CONCENTRIC,
        position: 1.0,
        velocity: 0.5,
        force: forceLbs,
      },
    ];
    return buildRep(1, samples);
  }

  it('getRepImpulse preserves input scale (100 lbs over 1s = 100 lbs·s)', () => {
    const rep = buildConstantForceRep(100);
    expect(getRepImpulse(rep)).toBeCloseTo(100, 5);
  });

  it('getRepWork preserves input scale (100 lbs over 1m = 100 lbs·m)', () => {
    const rep = buildConstantForceRep(100);
    expect(getRepWork(rep)).toBeCloseTo(100, 5);
  });

  it('getRepMeanConcentricPower preserves input scale (100 lbs·m / 1s = 100 lbs·m/s)', () => {
    const rep = buildConstantForceRep(100);
    expect(getRepMeanConcentricPower(rep)).toBeCloseTo(100, 5);
  });

  it('inflated force (tenths-of-lbs leaked through) inflates outputs 10x — guard', () => {
    // If an adapter forgets to divide by 10, a 100 lbs reading arrives as 1000.
    // Outputs scale linearly. This test documents the silent-failure mode so
    // any future hardening (e.g. runtime range check) can be hung off it.
    const correctRep = buildConstantForceRep(100);
    const inflatedRep = buildConstantForceRep(1000);
    expect(getRepImpulse(inflatedRep)).toBeCloseTo(getRepImpulse(correctRep) * 10, 5);
    expect(getRepWork(inflatedRep)).toBeCloseTo(getRepWork(correctRep) * 10, 5);
  });
});

// =============================================================================
// Total (Both-Phase) Kinetics Tests
//
// getRepTotalImpulse / getRepTotalWork sum the concentric and eccentric phase
// contributions. These branch-coverage top-up tests pin the sum against the
// individually verified per-phase values from createTestRep().
// =============================================================================

describe('getRepTotalImpulse()', () => {
  it('sums concentric and eccentric impulse', () => {
    const rep = createTestRep();
    // Concentric: 100 lbs × 1s = 100 lbs·s; Eccentric: 80 lbs × 2s = 160 lbs·s
    expect(getRepTotalImpulse(rep)).toBeCloseTo(260, 0);
    expect(getRepTotalImpulse(rep)).toBeCloseTo(
      getRepConcentricImpulse(rep) + getRepEccentricImpulse(rep),
      5
    );
  });

  it('returns 0 for an empty rep (no samples in either phase)', () => {
    expect(getRepTotalImpulse(createEmptyRep())).toBe(0);
  });
});

describe('getRepTotalWork()', () => {
  it('sums concentric and eccentric work', () => {
    const rep = createTestRep();
    // Concentric: 100 lbs·position; Eccentric: 80 lbs·position
    expect(getRepTotalWork(rep)).toBeCloseTo(180, 0);
    expect(getRepTotalWork(rep)).toBeCloseTo(
      getRepConcentricWork(rep) + getRepEccentricWork(rep),
      5
    );
  });

  it('returns 0 for an empty rep (no samples in either phase)', () => {
    expect(getRepTotalWork(createEmptyRep())).toBe(0);
  });
});

// =============================================================================
// Eccentric Kinetics With Insufficient Eccentric Samples
//
// A rep that never entered (or barely entered) the eccentric phase has < 2
// eccentric samples. Both integrals must short-circuit to 0 rather than throw
// or read undefined samples.
// =============================================================================

describe('eccentric kinetics with < 2 eccentric samples', () => {
  /** Rep with two concentric samples but no eccentric movement recorded. */
  function createConcentricOnlyRep(): Rep {
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
        position: 1.0,
        velocity: 0.5,
        force: 100,
      },
    ];
    return buildRep(1, samples);
  }

  it('getRepEccentricImpulse returns 0 when eccentric has no samples', () => {
    expect(getRepEccentricImpulse(createConcentricOnlyRep())).toBe(0);
  });

  it('getRepEccentricWork returns 0 when eccentric has no samples', () => {
    expect(getRepEccentricWork(createConcentricOnlyRep())).toBe(0);
  });

  it('getRepEccentricImpulse returns 0 for an empty rep', () => {
    expect(getRepEccentricImpulse(createEmptyRep())).toBe(0);
  });

  it('getRepEccentricWork returns 0 for an empty rep', () => {
    expect(getRepEccentricWork(createEmptyRep())).toBe(0);
  });
});

// =============================================================================
// HOLD/IDLE Path-Length Inflation (KNOWN-ISSUES-2026-07-27 §5)
//
// getRepWork previously summed Math.abs(Δposition) across every sample
// pair, including HOLD/IDLE dwell, so sensor jitter during a pause
// accumulated as if it were movement. getPhaseMeanVelocity already
// excludes HOLD/IDLE from its running sum; these fixtures pin the exact
// before/after numbers for that same exclusion applied to work.
// =============================================================================

describe('getRepWork() — HOLD/IDLE jitter', () => {
  /**
   * 5 IDLE samples oscillating ±1mm around position 0 (simulating sensor
   * noise while the lifter is stationary before the pull), followed by a
   * clean 0.6m concentric raise in 4 steps of 0.15m at a constant 50 lbf.
   * IDLE-to-IDLE jitter path length: 4 × 0.001m = 0.004m. The bridge from
   * the last IDLE sample (position 0) to the first CONCENTRIC sample
   * (position 0) is 0 either way, so it doesn't confound the comparison.
   */
  function createIdleJitterThenRaiseRep(): Rep {
    const idlePositions = [0, 0.001, 0, 0.001, 0];
    const idleSamples: WorkoutSample[] = idlePositions.map((position, i) => ({
      sequence: i,
      timestamp: 1000 + i * 100,
      phase: MovementPhase.IDLE,
      position,
      velocity: 0,
      force: 50,
    }));
    const raiseSamples: WorkoutSample[] = [0, 0.15, 0.3, 0.45, 0.6].map((position, i) => ({
      sequence: idleSamples.length + i,
      timestamp: 2000 + i * 200,
      phase: MovementPhase.CONCENTRIC,
      position,
      velocity: 0.75,
      force: 50,
    }));
    return buildRep(1, [...idleSamples, ...raiseSamples]);
  }

  it('AFTER FIX: IDLE jitter no longer inflates work — matches the true 50 lbs × 0.6m = 30 lbs·m', () => {
    // Pre-fix (pinned in the prior commit, unmodified source): 30.2 lbs·m
    // (0.604m path length, including the 0.004m IDLE zigzag). Post-fix: the
    // IDLE samples are excluded entirely, leaving only the 0.6m raise.
    const rep = createIdleJitterThenRaiseRep();
    expect(getRepWork(rep)).toBeCloseTo(30, 5);
  });

  /**
   * Concentric leg (0 -> 0.6m, seeds the rep) then an eccentric phase that
   * starts descending, pauses with a ±1mm HOLD zigzag at the top, then
   * finishes lowering 0.6 -> 0. A HOLD sample only routes into
   * `eccentric.samples` once the phase has genuinely started (see
   * `isInEccentricPhase` in `models/rep.ts`), hence the leading real
   * ECCENTRIC sample before the jitter.
   *
   * Path length: |0.601−0.6| + |0.6−0.601| + |0.601−0.6| + |0.6−0.601|
   * (HOLD zigzag, 0.004m) + |0.3−0.6| + |0−0.3| (lowering, 0.6m) = 0.604m.
   * × 50 lbf = 30.2 lbs·m.
   */
  function createEccentricHoldJitterRep(): Rep {
    const concentricLeg: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 500,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.75,
        force: 50,
      },
      {
        sequence: 1,
        timestamp: 700,
        phase: MovementPhase.CONCENTRIC,
        position: 0.6,
        velocity: 0.75,
        force: 50,
      },
    ];
    const eccentricSamples: WorkoutSample[] = [
      {
        sequence: 2,
        timestamp: 1300,
        phase: MovementPhase.ECCENTRIC,
        position: 0.6,
        velocity: 0,
        force: 50,
      },
      {
        sequence: 3,
        timestamp: 1400,
        phase: MovementPhase.HOLD,
        position: 0.601,
        velocity: 0,
        force: 50,
      },
      {
        sequence: 4,
        timestamp: 1500,
        phase: MovementPhase.HOLD,
        position: 0.6,
        velocity: 0,
        force: 50,
      },
      {
        sequence: 5,
        timestamp: 1600,
        phase: MovementPhase.HOLD,
        position: 0.601,
        velocity: 0,
        force: 50,
      },
      {
        sequence: 6,
        timestamp: 1700,
        phase: MovementPhase.HOLD,
        position: 0.6,
        velocity: 0,
        force: 50,
      },
      {
        sequence: 7,
        timestamp: 1900,
        phase: MovementPhase.ECCENTRIC,
        position: 0.3,
        velocity: 0.75,
        force: 50,
      },
      {
        sequence: 8,
        timestamp: 2100,
        phase: MovementPhase.ECCENTRIC,
        position: 0,
        velocity: 0.75,
        force: 50,
      },
    ];
    return buildRep(1, [...concentricLeg, ...eccentricSamples]);
  }

  it('AFTER FIX: HOLD jitter mid-eccentric no longer inflates getRepEccentricWork', () => {
    // Pre-fix (pinned in the prior commit): 30.2 lbs·m. Post-fix: the HOLD
    // samples are excluded, leaving only the 0.6m lowering leg (30 lbs·m).
    const rep = createEccentricHoldJitterRep();
    expect(getRepEccentricWork(rep)).toBeCloseTo(30, 5);
  });
});

describe('getRepWork() — pure movement-phase jitter is NOT removed by this fix', () => {
  /**
   * All 8 samples are labeled CONCENTRIC — no HOLD/IDLE anywhere — with a
   * ±1-2mm zigzag riding on top of a monotonic 0.6m climb (reproducing
   * KNOWN-ISSUES-2026-07-27 §5's "1mm of noise per sample on a 0.6m raise").
   * Because every sample is genuinely phase-labeled CONCENTRIC, the
   * HOLD/IDLE filter this brief scopes the fix to cannot touch it: the
   * sourced fix ("skip HOLD/IDLE") does not eliminate path-length
   * inflation from noise that arrives already labeled as movement. This is
   * the null-verdict case the brief asks to report rather than paper over
   * with an invented magnitude threshold.
   */
  function createNoisyRaiseRep(): Rep {
    const positions = [0, 0.151, 0.149, 0.301, 0.299, 0.451, 0.449, 0.6];
    const samples: WorkoutSample[] = positions.map((position, i) => ({
      sequence: i,
      timestamp: 1000 + i * 100,
      phase: MovementPhase.CONCENTRIC,
      position,
      velocity: 0.75,
      force: 50,
    }));
    return buildRep(1, samples);
  }

  it('reports ~2% inflation over the true 30 lbs·m both BEFORE and AFTER the HOLD/IDLE fix', () => {
    // Path length: 0.151+0.002+0.152+0.002+0.152+0.002+0.151 = 0.612m; × 50 = 30.6 lbs·m.
    // Net displacement is 0.6m (30 lbs·m true work) — a 2% inflation this fix cannot remove.
    const rep = createNoisyRaiseRep();
    expect(getRepWork(rep)).toBeCloseTo(30.6, 5);
  });
});
