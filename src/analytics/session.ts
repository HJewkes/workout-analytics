/**
 * Session Analytics - Session-level estimates from multiple sets.
 *
 * Higher-order computations combining set-level analytics into
 * strength, readiness, fatigue, and volume estimates.
 */

import type { Set } from '@/models/set';
import { getSetLoad } from '@/models/set';
import type { LoadVelocityProfile } from '@/vbt/profile';
import {
  type E1RMEstimate,
  estimateE1RMFromReps,
  estimateE1RMFromProfile,
  estimateHybridE1RM,
} from '@/vbt/e1rm';
import { estimatePerRepRIR, getRepHardnessWeight } from '@/analytics/intensity';
import { getSetFirstRepVelocity, getSetVelocityLossPct } from '@/analytics/set-analytics';

// =============================================================================
// Types
// =============================================================================

/**
 * Strength estimate from a training session.
 */
export interface StrengthEstimate {
  /** Estimated 1RM in load units */
  readonly estimated1RM: number;
  /** Confidence score (0-1) */
  readonly confidence: number;
  /** Method used for estimation */
  readonly source: 'profile' | 'reps' | 'hybrid';
}

/**
 * Readiness estimate from warmup velocity comparison.
 */
export interface ReadinessEstimate {
  /** Qualitative readiness zone */
  readonly zone: 'green' | 'yellow' | 'red';
  /** Ratio of actual to expected velocity */
  readonly velocityRatio: number;
  /** Confidence based on data quality */
  readonly confidence: number;
}

/**
 * Session-level fatigue estimate from cross-set analysis.
 */
export interface SessionFatigueEstimate {
  /** Overall fatigue level (0-1) */
  readonly level: number;
  /** Velocity recovery between sets (last set first-rep vs first set first-rep) */
  readonly velocityRecoveryPct: number;
  /** Drop in reps between first and last set */
  readonly repDropPct: number;
  /** Whether the session has entered junk volume territory */
  readonly isJunkVolume: boolean;
}

// =============================================================================
// Strength Estimation
// =============================================================================

/**
 * Compute strength estimate from session sets.
 *
 * Uses the best e1RM estimate from across all sets. When an LV profile
 * is available, combines profile-based and rep-based estimates via
 * the hybrid method.
 *
 * @param sets - All sets in the session
 * @param weights - Optional parallel array of load per set. Falls back to set.loadSettings.weight.
 * @param profile - Optional LV profile for velocity-based estimation
 * @returns Best strength estimate from the session
 */
export function computeStrengthEstimate(
  sets: readonly Set[],
  weights?: readonly number[],
  profile?: LoadVelocityProfile
): StrengthEstimate {
  if (sets.length === 0) {
    return { estimated1RM: 0, confidence: 0, source: 'reps' };
  }

  // Rep-based: find best e1RM from all sets via Epley
  let bestRepEstimate: E1RMEstimate = { e1RM: 0, confidence: 0, method: 'reps' };
  for (let i = 0; i < sets.length; i++) {
    const reps = sets[i].reps.length;
    const load = weights?.[i] ?? getSetLoad(sets[i]);
    if (reps > 0 && load > 0) {
      const est = estimateE1RMFromReps(load, reps);
      if (est.e1RM > bestRepEstimate.e1RM) {
        bestRepEstimate = est;
      }
    }
  }

  // Profile-based: if profile available
  if (profile && profile.dataPoints.length >= 2) {
    const profileEst = estimateE1RMFromProfile(profile);

    if (bestRepEstimate.e1RM > 0) {
      // Hybrid
      const hybrid = estimateHybridE1RM(profileEst, bestRepEstimate);
      return {
        estimated1RM: hybrid.e1RM,
        confidence: hybrid.confidence,
        source: 'hybrid',
      };
    }

    return {
      estimated1RM: profileEst.e1RM,
      confidence: profileEst.confidence,
      source: 'profile',
    };
  }

  return {
    estimated1RM: bestRepEstimate.e1RM,
    confidence: bestRepEstimate.confidence,
    source: 'reps',
  };
}

// =============================================================================
// Readiness Estimation
// =============================================================================

/**
 * Compute readiness from comparing actual warmup velocity to baseline.
 *
 * Green: >= 95% of baseline (ready to push)
 * Yellow: 85-95% of baseline (normal day, moderate effort)
 * Red: < 85% of baseline (under-recovered, back off)
 *
 * @param actualVelocity - Observed first-rep velocity at the reference load
 * @param baselineVelocity - Expected velocity at that load from history
 * @returns Readiness assessment
 */
export function computeReadiness(
  actualVelocity: number,
  baselineVelocity: number
): ReadinessEstimate {
  if (baselineVelocity <= 0 || actualVelocity <= 0) {
    return { zone: 'yellow', velocityRatio: 0, confidence: 0 };
  }

  const velocityRatio = actualVelocity / baselineVelocity;

  let zone: 'green' | 'yellow' | 'red';
  if (velocityRatio >= 0.95) {
    zone = 'green';
  } else if (velocityRatio >= 0.85) {
    zone = 'yellow';
  } else {
    zone = 'red';
  }

  // Confidence based on how far the ratio is from threshold boundaries
  // Higher when clearly in a zone, lower when near boundaries
  const distFromNearest = Math.min(Math.abs(velocityRatio - 0.95), Math.abs(velocityRatio - 0.85));
  const confidence = Math.min(1, 0.6 + distFromNearest * 4);

  return { zone, velocityRatio, confidence };
}

// =============================================================================
// Session Fatigue
// =============================================================================

/**
 * Compute cross-set fatigue accumulation.
 *
 * Analyzes how performance degrades across sets within a session:
 * - Velocity recovery: comparing first-rep velocity of last set vs first set
 * - Rep drop: comparing rep count of last set vs first set
 * - Junk volume detection: when fatigue exceeds a threshold where
 *   additional volume is unlikely to provide meaningful stimulus
 *
 * @param sets - All sets in the session (in order)
 * @param weights - Optional parallel array of load per set. Falls back to set.loadSettings.weight.
 * @returns Session fatigue assessment
 */
export function computeSessionFatigue(
  sets: readonly Set[],
  _weights?: readonly number[]
): SessionFatigueEstimate {
  if (sets.length < 2) {
    return {
      level: 0,
      velocityRecoveryPct: 100,
      repDropPct: 0,
      isJunkVolume: false,
    };
  }

  // First-rep velocity of first and last sets
  const v1First = getSetFirstRepVelocity(sets[0]);
  const v1Last = getSetFirstRepVelocity(sets[sets.length - 1]);

  // Velocity recovery: how much first-rep velocity was preserved
  const velocityRecoveryPct = v1First > 0 ? (v1Last / v1First) * 100 : 100;

  // Rep drop between first and last set
  const repsFirst = sets[0].reps.length;
  const repsLast = sets[sets.length - 1].reps.length;
  const repDropPct = repsFirst > 0 ? ((repsFirst - repsLast) / repsFirst) * 100 : 0;

  // Average velocity loss across all sets
  let totalVelLoss = 0;
  for (const set of sets) {
    totalVelLoss += Math.abs(getSetVelocityLossPct(set));
  }
  const avgVelLoss = totalVelLoss / sets.length;

  // Fatigue level (0-1): composite of velocity recovery loss and rep drop
  const velRecoveryLoss = Math.max(0, 100 - velocityRecoveryPct) / 100;
  const repDropFactor = Math.max(0, repDropPct) / 100;
  const velLossFactor = Math.min(1, avgVelLoss / 50); // 50% avg loss = max fatigue

  const level = Math.min(1, velRecoveryLoss * 0.4 + repDropFactor * 0.3 + velLossFactor * 0.3);

  // Junk volume: velocity has dropped so much that additional sets
  // provide minimal stimulus (threshold: >25% first-rep velocity loss
  // and >40% average within-set velocity loss)
  const isJunkVolume = velocityRecoveryPct < 75 && avgVelLoss > 40;

  return {
    level: Math.min(1, Math.max(0, level)),
    velocityRecoveryPct,
    repDropPct: Math.max(0, repDropPct),
    isJunkVolume,
  };
}

// =============================================================================
// Volume Computation
// =============================================================================

/**
 * Compute total volume (load * reps summed across sets).
 *
 * @param sets - All sets in the session
 * @param weights - Optional parallel array of load per set. Falls back to set.loadSettings.weight.
 * @returns Total volume in load-units * reps
 */
export function computeVolume(sets: readonly Set[], weights?: readonly number[]): number {
  let volume = 0;
  for (let i = 0; i < sets.length; i++) {
    const load = weights?.[i] ?? getSetLoad(sets[i]);
    volume += load * sets[i].reps.length;
  }
  return volume;
}

/**
 * Compute effective volume weighted by proximity to failure.
 *
 * Each rep is weighted by its hardness (exponential decay from RIR).
 * This captures the insight that reps near failure contribute more
 * to hypertrophic stimulus than easy reps.
 *
 * effective_volume = sum_over_sets( sum_over_reps( hardness[i] * load ) )
 *
 * @param sets - All sets in the session
 * @param weights - Optional parallel array of load per set. Falls back to set.loadSettings.weight.
 * @param options - Optional decay rate
 * @returns Effective volume in load-units * effective-reps
 */
export function computeEffectiveVolume(
  sets: readonly Set[],
  weights?: readonly number[],
  options?: { decayRate?: number }
): number {
  const decayRate = options?.decayRate ?? 0.4;
  let effectiveVolume = 0;

  for (let i = 0; i < sets.length; i++) {
    const load = weights?.[i] ?? getSetLoad(sets[i]);
    const perRepRIR = estimatePerRepRIR(sets[i]);

    for (const rir of perRepRIR) {
      effectiveVolume += getRepHardnessWeight(rir, decayRate) * load;
    }
  }

  return effectiveVolume;
}
