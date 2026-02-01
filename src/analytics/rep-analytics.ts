/**
 * Rep Analytics - First-order analytics derived from Rep objects.
 *
 * These functions compute metrics directly from a single Rep,
 * without requiring external context or aggregation.
 */

import type { Rep } from '@/models/rep';
import { getPhaseMeanVelocity, getPhaseMeanForce, getPhaseMovementDuration } from '@/models/phase';

// =============================================================================
// Velocity Analytics
// =============================================================================

/**
 * Get mean eccentric velocity for a rep.
 * Returns 0 if eccentric phase has no movement samples.
 */
export function getRepMeanEccentricVelocity(rep: Rep): number {
  return getPhaseMeanVelocity(rep.eccentric);
}

// =============================================================================
// Force Analytics
// =============================================================================

/**
 * Get mean concentric force for a rep.
 * Returns 0 if concentric phase has no movement samples.
 */
export function getRepMeanConcentricForce(rep: Rep): number {
  return getPhaseMeanForce(rep.concentric);
}

/**
 * Get peak concentric force for a rep.
 * Returns 0 if concentric phase has no samples.
 */
export function getRepPeakConcentricForce(rep: Rep): number {
  return rep.concentric.peakForce;
}

/**
 * Get mean eccentric force for a rep.
 * Returns 0 if eccentric phase has no movement samples.
 */
export function getRepMeanEccentricForce(rep: Rep): number {
  return getPhaseMeanForce(rep.eccentric);
}

/**
 * Get peak eccentric force for a rep.
 * Returns 0 if eccentric phase has no samples.
 */
export function getRepPeakEccentricForce(rep: Rep): number {
  return rep.eccentric.peakForce;
}

// =============================================================================
// Timing Analytics
// =============================================================================

/**
 * Get concentric phase duration in seconds.
 * This is the movement time, excluding holds.
 */
export function getRepConcentricTime(rep: Rep): number {
  return getPhaseMovementDuration(rep.concentric);
}

/**
 * Get eccentric phase duration in seconds.
 * This is the movement time, excluding holds.
 */
export function getRepEccentricTime(rep: Rep): number {
  return getPhaseMovementDuration(rep.eccentric);
}

// =============================================================================
// Kinetics Analytics (Impulse and Work)
// =============================================================================

/**
 * Compute impulse (force × time integral) over the concentric phase.
 * Uses trapezoidal approximation over samples.
 *
 * Impulse = ∫ F dt ≈ Σ (F_avg × Δt)
 *
 * Returns impulse in N·s (Newton-seconds).
 */
export function getRepImpulse(rep: Rep): number {
  const samples = rep.concentric.samples;
  if (samples.length < 2) {
    return 0;
  }

  let impulse = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];

    // Time delta in seconds
    const dt = (curr.timestamp - prev.timestamp) / 1000;

    // Average force between samples (trapezoidal rule)
    const avgForce = (prev.force + curr.force) / 2;

    impulse += avgForce * dt;
  }

  return impulse;
}

/**
 * Compute work (force × displacement integral) over the concentric phase.
 * Uses trapezoidal approximation over samples.
 *
 * Work = ∫ F dx ≈ Σ (F_avg × Δx)
 *
 * Returns work estimate in Joules (if force is in N and position in meters).
 * Note: This is an approximation since we're using cable position, not true
 * displacement of the load.
 */
export function getRepWork(rep: Rep): number {
  const samples = rep.concentric.samples;
  if (samples.length < 2) {
    return 0;
  }

  let work = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];

    // Position change (absolute value for work calculation)
    const dx = Math.abs(curr.position - prev.position);

    // Average force between samples (trapezoidal rule)
    const avgForce = (prev.force + curr.force) / 2;

    work += avgForce * dx;
  }

  return work;
}

/**
 * Compute total impulse (both phases) for a rep.
 */
export function getRepTotalImpulse(rep: Rep): number {
  return getRepConcentricImpulse(rep) + getRepEccentricImpulse(rep);
}

/**
 * Compute concentric impulse (alias for getRepImpulse).
 */
export function getRepConcentricImpulse(rep: Rep): number {
  return getRepImpulse(rep);
}

/**
 * Compute eccentric impulse.
 */
export function getRepEccentricImpulse(rep: Rep): number {
  const samples = rep.eccentric.samples;
  if (samples.length < 2) {
    return 0;
  }

  let impulse = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dt = (curr.timestamp - prev.timestamp) / 1000;
    const avgForce = (prev.force + curr.force) / 2;
    impulse += avgForce * dt;
  }

  return impulse;
}

/**
 * Compute total work (both phases) for a rep.
 */
export function getRepTotalWork(rep: Rep): number {
  return getRepConcentricWork(rep) + getRepEccentricWork(rep);
}

/**
 * Compute concentric work (alias for getRepWork).
 */
export function getRepConcentricWork(rep: Rep): number {
  return getRepWork(rep);
}

/**
 * Compute eccentric work.
 */
export function getRepEccentricWork(rep: Rep): number {
  const samples = rep.eccentric.samples;
  if (samples.length < 2) {
    return 0;
  }

  let work = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const dx = Math.abs(curr.position - prev.position);
    const avgForce = (prev.force + curr.force) / 2;
    work += avgForce * dx;
  }

  return work;
}

// =============================================================================
// Power Analytics
// =============================================================================

/**
 * Compute mean concentric power (work / time).
 * Returns power in Watts (if work is in J and time in s).
 */
export function getRepMeanConcentricPower(rep: Rep): number {
  const time = getRepConcentricTime(rep);
  if (time === 0) return 0;
  return getRepConcentricWork(rep) / time;
}

/**
 * Compute mean eccentric power (work / time).
 * Note: Eccentric power is typically lower due to controlled lowering.
 */
export function getRepMeanEccentricPower(rep: Rep): number {
  const time = getRepEccentricTime(rep);
  if (time === 0) return 0;
  return getRepEccentricWork(rep) / time;
}
