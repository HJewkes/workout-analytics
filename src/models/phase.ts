/**
 * Phase - a container for samples with O(1) metrics.
 *
 * Phase is a simple "bag of samples with metrics". Its meaning (concentric vs eccentric)
 * comes from which slot it's in on Rep. IDLE and HOLD samples are both treated as pause
 * (contribute to hold duration, not movement metrics).
 */
import { MovementPhase } from './types';
import type { WorkoutSample } from './sample';

/**
 * Immutable Phase interface.
 * All metrics are pre-computed via running aggregates for O(1) access.
 */
export interface Phase {
  readonly samples: readonly WorkoutSample[];

  // Timing
  readonly startTime: number;
  readonly endTime: number;
  readonly startPosition: number;
  readonly endPosition: number;

  // Running aggregates (internal, for O(1) means)
  readonly _totalVelocity: number;
  readonly _totalForce: number;
  readonly _movementSampleCount: number;
  readonly _totalHoldDuration: number; // in ms

  // Peaks
  readonly peakVelocity: number;
  readonly peakForce: number;
}

/**
 * Empty phase constant - use instead of factory function.
 * Safe to share since Phase is immutable.
 */
export const EMPTY_PHASE: Phase = Object.freeze({
  samples: [],
  startTime: 0,
  endTime: 0,
  startPosition: 0,
  endPosition: 0,
  _totalVelocity: 0,
  _totalForce: 0,
  _movementSampleCount: 0,
  _totalHoldDuration: 0,
  peakVelocity: 0,
  peakForce: 0,
});

/**
 * Add sample to phase, returns NEW phase (immutable).
 * IDLE and HOLD samples are treated as pause (hold duration).
 */
export function addSampleToPhase(phase: Phase, sample: WorkoutSample): Phase {
  const isFirst = phase.samples.length === 0;
  // IDLE and HOLD both treated as pause
  const isHold = sample.phase === MovementPhase.HOLD || sample.phase === MovementPhase.IDLE;
  const timeDelta = isFirst ? 0 : sample.timestamp - phase.endTime;

  return {
    samples: [...phase.samples, sample],
    startTime: isFirst ? sample.timestamp : phase.startTime,
    endTime: sample.timestamp,
    startPosition: isFirst ? sample.position : phase.startPosition,
    endPosition: sample.position,
    _totalVelocity: isHold ? phase._totalVelocity : phase._totalVelocity + sample.velocity,
    _totalForce: isHold ? phase._totalForce : phase._totalForce + sample.force,
    _movementSampleCount: isHold ? phase._movementSampleCount : phase._movementSampleCount + 1,
    _totalHoldDuration: phase._totalHoldDuration + (isHold ? timeDelta : 0),
    peakVelocity: isHold ? phase.peakVelocity : Math.max(phase.peakVelocity, sample.velocity),
    peakForce: isHold ? phase.peakForce : Math.max(phase.peakForce, sample.force),
  };
}

/**
 * Rebuild phase from samples (used after trimming).
 */
export function rebuildPhaseFromSamples(samples: readonly WorkoutSample[]): Phase {
  return samples.reduce((phase, sample) => addSampleToPhase(phase, sample), EMPTY_PHASE);
}

// Derived helpers (all O(1))

export function getPhaseDuration(phase: Phase): number {
  return (phase.endTime - phase.startTime) / 1000;
}

export function getPhaseHoldDuration(phase: Phase): number {
  return phase._totalHoldDuration / 1000;
}

export function getPhaseMovementDuration(phase: Phase): number {
  return getPhaseDuration(phase) - getPhaseHoldDuration(phase);
}

export function getPhaseMeanVelocity(phase: Phase): number {
  if (phase._movementSampleCount === 0) return 0;
  return phase._totalVelocity / phase._movementSampleCount;
}

export function getPhaseMeanForce(phase: Phase): number {
  if (phase._movementSampleCount === 0) return 0;
  return phase._totalForce / phase._movementSampleCount;
}

export function getPhaseRangeOfMotion(phase: Phase): number {
  return Math.abs(phase.endPosition - phase.startPosition);
}
