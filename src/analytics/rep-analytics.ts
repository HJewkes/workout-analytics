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
 * Units: WorkoutSample.force is contracted as lbs (NOT tenths-of-lbs;
 * see `models/sample.ts`). Output is therefore in lbs·s. The library
 * does NOT convert to N·s — callers requiring SI units must scale by
 * 4.448. If an adapter passes inflated tenths-of-lbs values, this
 * function silently returns 10x the true impulse.
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
 * Units: WorkoutSample.force is in lbs (NOT tenths-of-lbs;
 * see `models/sample.ts`) and `position` is the normalized cable position
 * (0..1). Output is therefore in lbs·position-units, NOT Joules. Callers
 * requiring Joules must scale force to N (×4.448) and position to meters
 * of cable travel.
 *
 * Note: This is an approximation since we're using cable position, not true
 * displacement of the load. If an adapter passes inflated tenths-of-lbs
 * values, this function silently returns 10x the true work.
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
 *
 * Units: derived from `getRepWork` (lbs·position-units) divided by
 * concentric time (seconds). Output is therefore in lbs·position-units
 * per second, NOT Watts. Callers requiring Watts must scale per the
 * unit notes on `getRepWork`. Inherits the same 10x silent-inflation
 * failure mode if an adapter passes tenths-of-lbs.
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
