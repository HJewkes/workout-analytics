/**
 * Regression coverage for the shared HOLD/IDLE predicate (VW-234).
 *
 * `isHoldOrIdleSample` used to be reimplemented at each of its call sites.
 * The unit check below pins its own behaviour; the spy-based checks pin that
 * `addSampleToRep` (models/rep.ts) and `getRepWork` (analytics/rep-analytics.ts)
 * — both importing it across a module boundary — still call it rather than a
 * silently reintroduced inline comparison.
 */

import { describe, it, expect, vi } from 'vitest';
import * as phaseModule from '@/models/phase';
import { isHoldOrIdleSample } from '@/models/phase';
import { createRep, addSampleToRep } from '@/models/rep';
import { getRepWork } from '@/analytics/rep-analytics';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';

function sample(overrides: Partial<WorkoutSample> = {}): WorkoutSample {
  return {
    sequence: 0,
    timestamp: 1000,
    phase: MovementPhase.CONCENTRIC,
    position: 0,
    velocity: 0.5,
    force: 100,
    ...overrides,
  };
}

describe('isHoldOrIdleSample', () => {
  it('is true for HOLD and IDLE, false for CONCENTRIC and ECCENTRIC', () => {
    expect(isHoldOrIdleSample(sample({ phase: MovementPhase.HOLD }))).toBe(true);
    expect(isHoldOrIdleSample(sample({ phase: MovementPhase.IDLE }))).toBe(true);
    expect(isHoldOrIdleSample(sample({ phase: MovementPhase.CONCENTRIC }))).toBe(false);
    expect(isHoldOrIdleSample(sample({ phase: MovementPhase.ECCENTRIC }))).toBe(false);
  });
});

describe('shared predicate usage (VW-234)', () => {
  it('addSampleToRep calls the shared predicate rather than a reintroduced inline check', () => {
    const spy = vi.spyOn(phaseModule, 'isHoldOrIdleSample');
    const rep = addSampleToRep(createRep(1), sample({ phase: MovementPhase.HOLD }));
    expect(spy).toHaveBeenCalled();
    // A leading HOLD sample with no phase started yet is routed to concentric.
    expect(rep.concentric.samples).toHaveLength(1);
    spy.mockRestore();
  });

  it('getRepWork calls the shared predicate rather than a reintroduced inline check', () => {
    const spy = vi.spyOn(phaseModule, 'isHoldOrIdleSample');
    let rep = createRep(1);
    rep = addSampleToRep(rep, sample({ sequence: 0, timestamp: 1000, position: 0 }));
    rep = addSampleToRep(
      rep,
      sample({ sequence: 1, timestamp: 1100, phase: MovementPhase.HOLD, position: 0.1 })
    );
    rep = addSampleToRep(rep, sample({ sequence: 2, timestamp: 1200, position: 0.2 }));
    spy.mockClear();

    getRepWork(rep);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
