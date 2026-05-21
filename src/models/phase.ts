/**
 * Phase - a container for samples with O(1) metrics.
 *
 * Phase is a simple "bag of samples with metrics". Its meaning (concentric vs eccentric)
 * comes from which slot it's in on Rep. IDLE and HOLD samples are both treated as pause
 * (contribute to hold duration, not movement metrics).
 */
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';

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
  readonly _totalLoad: number;
  readonly _movementSampleCount: number;
  readonly _totalHoldDuration: number; // in ms
  /**
   * Timestamp (ms) of the sample that set the current `peakVelocity`. Held at
   * 0 until the first movement sample arrives. Updated only when a new peak
   * is set, so the value points at the actual moment peak velocity occurred.
   */
  readonly _peakVelocityTime: number;
  /**
   * `|velocity|` of the most recent movement sample, in mm/s. Used by
   * `getPhaseVelocityDropPct` to compute the start→end falloff without
   * re-walking the samples array. Held at 0 across hold/idle samples so a
   * trailing hold doesn't reset the recorded movement velocity.
   */
  readonly _lastMovementVelocity: number;

  // Peaks
  readonly peakVelocity: number;
  readonly peakForce: number;
  readonly peakLoad: number;
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
  _totalLoad: 0,
  _movementSampleCount: 0,
  _totalHoldDuration: 0,
  _peakVelocityTime: 0,
  _lastMovementVelocity: 0,
  peakVelocity: 0,
  peakForce: 0,
  peakLoad: 0,
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

  const sampleLoad = sample.load ?? 0;
  // Defensive: WorkoutSample.velocity contract is magnitude (non-negative).
  // SDK 0.6.0 decoder fix made device velocity signed (eccentric < 0). If a
  // buggy adapter forwards the signed value directly, raw Math.max would
  // zero out peak velocity (Math.max(0, -1.2) === 0). Normalize here so
  // peaks and means stay correct; a properly-implemented adapter passes
  // magnitudes and this is a no-op.
  const sampleVelocity = Math.abs(sample.velocity);
  // New peak iff this is a movement sample AND it strictly beats the running
  // max. Track timestamp + last-velocity in lockstep so the time-to-peak and
  // velocity-drop helpers stay O(1).
  const isNewPeak = !isHold && sampleVelocity > phase.peakVelocity;

  return {
    samples: [...phase.samples, sample],
    startTime: isFirst ? sample.timestamp : phase.startTime,
    endTime: sample.timestamp,
    startPosition: isFirst ? sample.position : phase.startPosition,
    endPosition: sample.position,
    _totalVelocity: isHold ? phase._totalVelocity : phase._totalVelocity + sampleVelocity,
    _totalForce: isHold ? phase._totalForce : phase._totalForce + sample.force,
    _totalLoad: isHold ? phase._totalLoad : phase._totalLoad + sampleLoad,
    _movementSampleCount: isHold ? phase._movementSampleCount : phase._movementSampleCount + 1,
    _totalHoldDuration: phase._totalHoldDuration + (isHold ? timeDelta : 0),
    _peakVelocityTime: isNewPeak ? sample.timestamp : phase._peakVelocityTime,
    _lastMovementVelocity: isHold ? phase._lastMovementVelocity : sampleVelocity,
    peakVelocity: isHold ? phase.peakVelocity : Math.max(phase.peakVelocity, sampleVelocity),
    peakForce: isHold ? phase.peakForce : Math.max(phase.peakForce, sample.force),
    peakLoad: isHold ? phase.peakLoad : Math.max(phase.peakLoad, sampleLoad),
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

export function getPhaseMeanLoad(phase: Phase): number {
  if (phase._movementSampleCount === 0) return 0;
  return phase._totalLoad / phase._movementSampleCount;
}

export function getPhasePeakLoad(phase: Phase): number {
  return phase.peakLoad;
}

/**
 * Time (ms) from the phase's start to the sample at which peak velocity
 * was set. Returns 0 when the phase has no movement samples. Useful for
 * power-coaching cues — "your bar peaked at 35% through the pull" vs
 * "60% through" tells a different intent story than peak velocity alone.
 */
export function getPhaseTimeToPeakVelocityMs(phase: Phase): number {
  if (phase._movementSampleCount === 0) return 0;
  return phase._peakVelocityTime - phase.startTime;
}

/**
 * Velocity drop from peak to end-of-movement, as a percentage. Computed
 * `(peakVelocity − lastMovementVelocity) / peakVelocity × 100`. A positive
 * value means the bar slowed before phase end (typical for grinder reps);
 * 0 means the phase ended at peak velocity (often the case for fast,
 * explosive concentric pulls that don't decelerate before the eccentric
 * starts). Returns 0 when `peakVelocity` is 0 to avoid divide-by-zero.
 */
export function getPhaseVelocityDropPct(phase: Phase): number {
  if (phase.peakVelocity <= 0) return 0;
  const drop = phase.peakVelocity - phase._lastMovementVelocity;
  return (drop / phase.peakVelocity) * 100;
}

/**
 * Four-point velocity envelope sampled at 25 / 50 / 75 / 100% of the
 * phase's MOVEMENT span (hold/idle samples excluded so a paused-rep
 * doesn't dilute the curve). Each entry is the `|velocity|` of the
 * movement sample whose timestamp is closest to the target time. Returns
 * `[0, 0, 0, 0]` when the phase has fewer than two movement samples
 * (the envelope is undefined for a single-point or empty phase).
 *
 * Compressing the velocity-time curve to four points is a deliberate
 * tradeoff: a coaching surface can reason about "did the bar slow ¾
 * through the concentric" without consuming the full 40 Hz sample stream.
 * Anything sub-quarter resolution starts to be noise on BLE telemetry.
 */
export function getPhaseVelocityEnvelope(phase: Phase): [number, number, number, number] {
  const movementSamples = phase.samples.filter(
    (s) => s.phase !== MovementPhase.HOLD && s.phase !== MovementPhase.IDLE
  );
  if (movementSamples.length < 2) return [0, 0, 0, 0];

  const tStart = movementSamples[0].timestamp;
  const tEnd = movementSamples[movementSamples.length - 1].timestamp;
  const span = tEnd - tStart;
  if (span <= 0) return [0, 0, 0, 0];

  const targets = [0.25, 0.5, 0.75, 1.0].map((p) => tStart + p * span);
  // For each target time, walk forward until we find the movement sample
  // whose timestamp is closest. The targets list is monotonically increasing
  // so we can advance a shared cursor instead of re-scanning the whole
  // array — keeps this O(N) over phase samples, not O(N·4).
  const envelope: number[] = [];
  let cursor = 0;
  for (const target of targets) {
    while (
      cursor + 1 < movementSamples.length &&
      Math.abs(movementSamples[cursor + 1].timestamp - target) <
        Math.abs(movementSamples[cursor].timestamp - target)
    ) {
      cursor += 1;
    }
    envelope.push(Math.abs(movementSamples[cursor].velocity));
  }
  return envelope as [number, number, number, number];
}
