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
  getRepConcentricWork,
  getRepEccentricWork,
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
