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
  getPhaseMeanLoad,
  getPhaseRangeOfMotion,
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

/**
 * Rep range of motion = the displacement the load traversed during the
 * concentric phase (|end − start|), NOT the absolute peak position.
 *
 * WA-02.03: this previously returned `rep.concentric.endPosition` (absolute
 * position from machine zero), which over-reports ROM by the concentric start
 * offset for any rep that doesn't begin at 0 — partial reps, positional drift,
 * non-zero rest position — the exact cases fatigue/partial-rep detection relies
 * on. "Range of motion" is a span, not a coordinate; delegate to the phase-level
 * displacement metric that the rest of the package already uses and tests.
 */
export function getRepRangeOfMotion(rep: Rep): number {
  return getPhaseRangeOfMotion(rep.concentric);
}

export function getRepSamples(rep: Rep): readonly WorkoutSample[] {
  return [...rep.concentric.samples, ...rep.eccentric.samples];
}

export function getRepMeanLoad(rep: Rep): number {
  return getPhaseMeanLoad(rep.concentric);
}

export function getRepPeakLoad(rep: Rep): number {
  return Math.max(rep.concentric.peakLoad, rep.eccentric.peakLoad);
}

/**
 * Ratio of eccentric movement duration to concentric movement duration.
 * A standard tempo discipline cue — bodybuilding programming typically
 * targets ratios in the 2.0-3.0 range (2-3 s eccentric, 1 s concentric),
 * while explosive power work runs closer to 1.0. Hold time is excluded
 * from both numerator and denominator (uses `getPhaseMovementDuration`),
 * so a "pause at the top" doesn't inflate the eccentric side.
 *
 * Returns 0 when the concentric phase has no movement (a phase that
 * never actually started would otherwise blow up to Infinity). 0 is the
 * same sentinel the existing duration helpers use for "no data here."
 */
export function getRepTempoRatio(rep: Rep): number {
  const concDur = getPhaseMovementDuration(rep.concentric);
  const eccDur = getPhaseMovementDuration(rep.eccentric);
  if (concDur <= 0) return 0;
  return eccDur / concDur;
}

/**
 * Hold time at the top of the rep — the gap between the last concentric
 * sample and the first eccentric sample. Returns 0 when the eccentric
 * phase never started (rep N at set close, which is finalized via
 * SetSummary rather than a phase transition).
 *
 * Derived from inter-phase timestamps rather than from
 * `getPhaseHoldDuration(rep.concentric)` so it isolates the deliberate
 * pause between phases from any mid-concentric pauses the user may have
 * taken (which `getPhaseHoldDuration` lumps together). The two values
 * agree on a typical no-mid-pause rep; this helper is the precise one
 * for coaching cues like "you didn't pause at the top."
 */
export function getRepHoldTopMs(rep: Rep): number {
  if (rep.eccentric.samples.length === 0) return 0;
  if (rep.concentric.samples.length === 0) return 0;
  const gap = rep.eccentric.startTime - rep.concentric.endTime;
  return gap > 0 ? gap : 0;
}
