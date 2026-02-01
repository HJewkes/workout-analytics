/**
 * Rep - a complete repetition consisting of 2 phases.
 *
 * Rep is pure data - just a container for concentric and eccentric phases.
 * No state management. Rep boundaries are determined by Set based on phase transitions.
 */
import {
  type Phase,
  EMPTY_PHASE,
  addSampleToPhase,
  getPhaseHoldDuration,
  getPhaseMovementDuration,
  getPhaseMeanVelocity,
} from '@/models/phase';
import type { WorkoutSample } from '@/models/sample';
import { MovementPhase } from '@/models/types';
import { formatTempo } from '@/models/tempo';

/**
 * Immutable Rep interface.
 * Pure data - no state field.
 */
export interface Rep {
  readonly repNumber: number;
  readonly concentric: Phase;
  readonly eccentric: Phase;
}

/**
 * Create a new rep with empty phases.
 */
export function createRep(repNumber: number): Rep {
  return {
    repNumber,
    concentric: EMPTY_PHASE,
    eccentric: EMPTY_PHASE,
  };
}

/**
 * Check if eccentric phase has started.
 */
export function isInEccentricPhase(rep: Rep): boolean {
  return rep.eccentric.samples.length > 0;
}

/**
 * Add sample to rep, returns NEW rep (immutable).
 * Routes sample to appropriate phase based on current state.
 */
export function addSampleToRep(rep: Rep, sample: WorkoutSample): Rep {
  let { concentric, eccentric } = rep;

  // IDLE and HOLD both treated as pause
  const isHold = sample.phase === MovementPhase.HOLD || sample.phase === MovementPhase.IDLE;

  if (sample.phase === MovementPhase.CONCENTRIC || (isHold && !isInEccentricPhase(rep))) {
    concentric = addSampleToPhase(concentric, sample);
  } else if (sample.phase === MovementPhase.ECCENTRIC || (isHold && isInEccentricPhase(rep))) {
    eccentric = addSampleToPhase(eccentric, sample);
  }

  return { repNumber: rep.repNumber, concentric, eccentric };
}

// Derived helpers (all O(1))

export function getRepDuration(rep: Rep): number {
  const start = rep.concentric.startTime;
  const end = rep.eccentric.endTime || rep.concentric.endTime;
  return (end - start) / 1000;
}

export function getRepTempo(rep: Rep): string {
  return formatTempo({
    eccentric: getPhaseMovementDuration(rep.eccentric),
    holdTop: getPhaseHoldDuration(rep.concentric),
    concentric: getPhaseMovementDuration(rep.concentric),
    holdBottom: getPhaseHoldDuration(rep.eccentric),
  });
}

export function getRepMeanVelocity(rep: Rep): number {
  return getPhaseMeanVelocity(rep.concentric);
}

export function getRepPeakVelocity(rep: Rep): number {
  return rep.concentric.peakVelocity;
}

export function getRepPeakForce(rep: Rep): number {
  return Math.max(rep.concentric.peakForce, rep.eccentric.peakForce);
}

export function getRepRangeOfMotion(rep: Rep): number {
  return rep.concentric.endPosition;
}

export function getRepSamples(rep: Rep): readonly WorkoutSample[] {
  return [...rep.concentric.samples, ...rep.eccentric.samples];
}
