/**
 * Set Analytics - First-order analytics derived from Set objects.
 *
 * These functions compute VBT-critical metrics directly from a single Set,
 * without requiring external context or historical data.
 */

import type { Set } from '@/models/set';
import { getRepMeanVelocity, getRepPeakVelocity, getRepRangeOfMotion } from '@/models/rep';
import { getRepMeanEccentricVelocity } from '@/analytics/rep-analytics';

// =============================================================================
// Velocity Analytics
// =============================================================================

/**
 * Get mean concentric velocity of the first rep.
 * Returns 0 if set has no reps.
 */
export function getSetFirstRepVelocity(set: Set): number {
  const firstRep = set.reps[0];
  if (!firstRep) return 0;
  return getRepMeanVelocity(firstRep);
}

/**
 * Get mean concentric velocity of the last rep.
 * Returns 0 if set has no reps.
 */
export function getSetLastRepVelocity(set: Set): number {
  const lastRep = set.reps.at(-1);
  if (!lastRep) return 0;
  return getRepMeanVelocity(lastRep);
}

/**
 * Get the best (maximum) mean concentric velocity across all reps.
 * Returns 0 if set has no reps.
 */
export function getSetBestRepVelocity(set: Set): number {
  if (set.reps.length === 0) return 0;
  return Math.max(...set.reps.map(getRepMeanVelocity));
}

/**
 * Get velocity loss percentage: (VBest - VLast) / VBest × 100.
 *
 * The reference is the fastest (best) MEAN-concentric-velocity rep of the set,
 * not the first rep (García-Ramos/Jukic 2021; brain decision WA-D01). On a clean
 * monotonic set the first rep IS the fastest, so this equals the legacy
 * first-to-last value; on slow-start / ramp / engagement-artifact sets — common
 * on cable hardware — it correctly reports the deeper loss the first-rep
 * reference understated.
 *
 * Because VBest ≥ VLast by construction, the result is ALWAYS ≥ 0: a set that
 * never slows below its best rep returns 0 (there is no "sped up past the last
 * rep" negative branch — the best rep is the reference, so no rep can exceed it).
 *
 * Returns 0 if VBest is 0 or the set has no reps.
 */
export function getSetVelocityLossPct(set: Set): number {
  const vBest = getSetBestRepVelocity(set);
  const vLast = getSetLastRepVelocity(set);
  if (vBest === 0) return 0;
  return ((vBest - vLast) / vBest) * 100;
}

/**
 * Get mean velocity across all reps.
 * Returns 0 if set has no reps.
 */
export function getSetMeanVelocity(set: Set): number {
  if (set.reps.length === 0) return 0;
  const sum = set.reps.reduce((acc, rep) => acc + getRepMeanVelocity(rep), 0);
  return sum / set.reps.length;
}

/**
 * Get the best (maximum) peak concentric velocity across all reps.
 * Returns 0 if set has no reps.
 */
export function getSetPeakVelocity(set: Set): number {
  if (set.reps.length === 0) return 0;
  return Math.max(...set.reps.map(getRepPeakVelocity));
}

/**
 * Get velocities for all reps as an array.
 * Useful for building distributions or detailed analysis.
 */
export function getSetRepVelocities(set: Set): number[] {
  return set.reps.map(getRepMeanVelocity);
}

// =============================================================================
// Eccentric Velocity Analytics
// =============================================================================

/**
 * Get mean eccentric velocity of the first rep.
 * Returns 0 if set has no reps.
 */
export function getSetFirstRepEccentricVelocity(set: Set): number {
  const firstRep = set.reps[0];
  if (!firstRep) return 0;
  return getRepMeanEccentricVelocity(firstRep);
}

/**
 * Get mean eccentric velocity of the last rep.
 * Returns 0 if set has no reps.
 */
export function getSetLastRepEccentricVelocity(set: Set): number {
  const lastRep = set.reps.at(-1);
  if (!lastRep) return 0;
  return getRepMeanEccentricVelocity(lastRep);
}

/**
 * Get mean eccentric velocity across all reps.
 * Returns 0 if set has no reps.
 */
export function getSetMeanEccentricVelocity(set: Set): number {
  if (set.reps.length === 0) return 0;
  const sum = set.reps.reduce((acc, rep) => acc + getRepMeanEccentricVelocity(rep), 0);
  return sum / set.reps.length;
}

/**
 * Get eccentric velocities for all reps as an array.
 * Useful for tracking eccentric control trends across the set.
 */
export function getSetRepEccentricVelocities(set: Set): number[] {
  return set.reps.map(getRepMeanEccentricVelocity);
}

/**
 * Get eccentric velocity change percentage: (VEcc_last - VEcc_first) / VEcc_first × 100.
 * Positive value indicates eccentric is speeding up (loss of control).
 * Negative value indicates eccentric is slowing down (more controlled).
 * Returns 0 if first rep eccentric velocity is 0 or set has no reps.
 */
export function getSetEccentricVelocityChangePct(set: Set): number {
  const vFirst = getSetFirstRepEccentricVelocity(set);
  const vLast = getSetLastRepEccentricVelocity(set);
  if (vFirst === 0) return 0;
  return ((vLast - vFirst) / vFirst) * 100;
}

// =============================================================================
// Range of Motion Analytics
// =============================================================================

/**
 * Get mean range of motion across all reps.
 * Returns 0 if set has no reps.
 */
export function getSetMeanROM(set: Set): number {
  if (set.reps.length === 0) return 0;
  const sum = set.reps.reduce((acc, rep) => acc + getRepRangeOfMotion(rep), 0);
  return sum / set.reps.length;
}

/**
 * Get the best (maximum) range of motion across all reps.
 * Returns 0 if set has no reps.
 */
export function getSetBestROM(set: Set): number {
  if (set.reps.length === 0) return 0;
  return Math.max(...set.reps.map(getRepRangeOfMotion));
}

/**
 * Get the first rep's range of motion.
 * Returns 0 if set has no reps.
 */
export function getSetFirstRepROM(set: Set): number {
  const firstRep = set.reps[0];
  if (!firstRep) return 0;
  return getRepRangeOfMotion(firstRep);
}

/**
 * Get the last rep's range of motion.
 * Returns 0 if set has no reps.
 */
export function getSetLastRepROM(set: Set): number {
  const lastRep = set.reps.at(-1);
  if (!lastRep) return 0;
  return getRepRangeOfMotion(lastRep);
}

/**
 * Get ROMs for all reps as an array.
 * Useful for building distributions or detailed analysis.
 */
export function getSetRepROMs(set: Set): number[] {
  return set.reps.map(getRepRangeOfMotion);
}

// =============================================================================
// Rep Index Helpers
// =============================================================================

/**
 * Get velocity for a specific rep by index (1-based).
 * Returns 0 if rep doesn't exist.
 */
export function getSetRepVelocityAt(set: Set, repNumber: number): number {
  const rep = set.reps[repNumber - 1];
  if (!rep) return 0;
  return getRepMeanVelocity(rep);
}

/**
 * Get ROM for a specific rep by index (1-based).
 * Returns 0 if rep doesn't exist.
 */
export function getSetRepROMAt(set: Set, repNumber: number): number {
  const rep = set.reps[repNumber - 1];
  if (!rep) return 0;
  return getRepRangeOfMotion(rep);
}

// =============================================================================
// Summary Statistics
// =============================================================================

/**
 * Get a summary of velocity statistics for the set.
 */
export interface SetVelocitySummary {
  first: number;
  last: number;
  best: number;
  mean: number;
  peak: number;
  lossPct: number;
  repCount: number;
}

/**
 * Get comprehensive velocity summary for a set.
 */
export function getSetVelocitySummary(set: Set): SetVelocitySummary {
  return {
    first: getSetFirstRepVelocity(set),
    last: getSetLastRepVelocity(set),
    best: getSetBestRepVelocity(set),
    mean: getSetMeanVelocity(set),
    peak: getSetPeakVelocity(set),
    lossPct: getSetVelocityLossPct(set),
    repCount: set.reps.length,
  };
}
