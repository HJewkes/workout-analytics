/**
 * Intensity Analytics - Quantify training stimulus per rep and set.
 *
 * Functions for per-rep RIR derivation, exponential hardness weighting,
 * set intensity scoring, and stimulus score computation.
 *
 * Research basis:
 * - Hardness decay (k=0.4): Robinson et al. 2024, Refalo 2024, Martikainen 2025
 * - Per-rep RIR via velocity: R²=0.93-0.97 (J Strength Cond Res 2020)
 * - Stimulus score: Voltra-specific heuristic (see plan Research Basis section)
 */

import type { Set } from '@/models/set';
import { getSetLoad } from '@/models/set';
import { getRepMeanVelocity, getRepRangeOfMotion } from '@/models/rep';
import { getRepConcentricTime, getRepEccentricTime } from '@/analytics/rep-analytics';
import { estimateSetRIR } from '@/analytics/fatigue';

// =============================================================================
// Constants
// =============================================================================

/** Default exponential decay rate for hardness weighting. */
const DEFAULT_DECAY_RATE = 0.4;

// =============================================================================
// Per-Rep RIR Derivation
// =============================================================================

/**
 * Derive per-rep RIR estimates from set-level RIR using velocity-proportional
 * interpolation. Each rep's RIR is positioned along the set's velocity decay
 * curve rather than a simple linear +1 per rep.
 *
 * Primary method (velocity-proportional):
 *   repRIR[i] = setRIR + remainingReps * (1 - velocityLoss[i] / totalVelocityLoss)
 *   where velocityLoss[i] = (v[0] - v[i]) / v[0]
 *
 * Fallback (when velocity data is noisy or unavailable):
 *   repRIR[i] = setRIR + (totalReps - 1 - i)
 *
 * Research: Velocity loss within a set correlates R²=0.93-0.97 with
 * percentage of reps completed (bench press / back squat). The velocity-
 * to-RIR relationship produces errors of only -0.4 to 0.6 reps.
 *
 * @param set - The set to analyze
 * @param setRIR - Override set-level RIR. If not provided, uses estimateSetRIR() from fatigue module.
 * @returns Array of per-rep RIR estimates (same length as set.reps)
 */
export function estimatePerRepRIR(set: Set, setRIR?: number): readonly number[] {
  const n = set.reps.length;
  if (n === 0) return [];

  // Get set-level RIR
  const resolvedSetRIR = setRIR ?? estimateSetRIR(set).rir;

  // Single rep: just return set RIR
  if (n === 1) return [resolvedSetRIR];

  // Get per-rep velocities
  const velocities = set.reps.map(getRepMeanVelocity);
  const v0 = velocities[0];
  const vLast = velocities[n - 1];
  const totalVelocityLoss = v0 - vLast;

  // Remaining reps beyond the last rep
  const remainingReps = n - 1;

  // If no meaningful velocity decay (noisy data), fall back to linear
  if (v0 <= 0 || totalVelocityLoss <= 0) {
    return velocities.map((_, i) => Math.max(0, resolvedSetRIR + (n - 1 - i)));
  }

  // Velocity-proportional interpolation
  return velocities.map((v, i) => {
    const velocityLossI = (v0 - v) / v0;
    const totalVelocityLossFraction = totalVelocityLoss / v0;

    // How much of the total velocity loss has occurred at rep i?
    const proportionOfDecay = totalVelocityLossFraction > 0
      ? velocityLossI / totalVelocityLossFraction
      : i / (n - 1);

    // RIR decreases as more velocity loss has occurred
    const repRIR = resolvedSetRIR + remainingReps * (1 - proportionOfDecay);
    return Math.max(0, repRIR);
  });
}

// =============================================================================
// Rep Hardness Weighting
// =============================================================================

/**
 * Exponential hardness weight: e^(-k * rir).
 * RIR 0->1 difference is larger than 1->2, 2->3, etc.
 *
 * At default k=0.4: RIR 0 = 1.00, RIR 1 = 0.67, RIR 2 = 0.45, RIR 3 = 0.30, RIR 4 = 0.20
 *
 * Research basis: The 2024 Robinson et al. meta-regression found a gradual
 * dose-response between proximity to failure and hypertrophy -- not a steep
 * threshold. Studies show RIR 3-4 still contribute meaningfully to growth.
 *
 * @param rir - Estimated reps in reserve (clamped to >= 0)
 * @param decayRate - Steepness (default 0.4). Higher = steeper curve.
 * @returns 0-1 where 1.0 = maximum hardness (RIR 0)
 */
export function getRepHardnessWeight(rir: number, decayRate: number = DEFAULT_DECAY_RATE): number {
  const clampedRIR = Math.max(0, rir);
  return Math.exp(-decayRate * clampedRIR);
}

// =============================================================================
// Set Intensity Score
// =============================================================================

/**
 * Sum of per-rep hardness weights -- "effective stimulus reps."
 *
 * A set of 8 reps at RIR 2 with default decay produces ~3.6 effective reps.
 * A set of 5 reps at RIR 0 produces ~3.2 effective reps.
 * This captures the insight that more reps near failure = more stimulus.
 *
 * @param set - The set to score
 * @param options - Optional decay rate and set RIR override
 * @returns Sum of hardness weights (effective stimulus reps)
 */
export function getSetIntensityScore(
  set: Set,
  options?: { decayRate?: number; setRIR?: number },
): number {
  const decayRate = options?.decayRate ?? DEFAULT_DECAY_RATE;
  const perRepRIR = estimatePerRepRIR(set, options?.setRIR);

  return perRepRIR.reduce((sum, rir) => sum + getRepHardnessWeight(rir, decayRate), 0);
}

// =============================================================================
// Stimulus Score
// =============================================================================

/**
 * Per-set stimulus combining effective load with optional kinematic multipliers.
 *
 * Default formula: sum_over_reps(hardness[i] * load)
 *   = "effective load" -- how much of the load contributed to growth stimulus.
 *
 * With optional multipliers enabled:
 *   sum_over_reps(hardness[i] * load * romFactor[i] * tutFactor[i])
 *   where romFactor = repROM / expectedROM (normalized, default 1.0)
 *   and tutFactor = repTUT / expectedTUT (normalized, default 1.0)
 *
 * Normalized by e1RM if provided (makes scores comparable across exercises).
 *
 * NOTE: This is a Voltra-specific heuristic, not a published metric.
 * No existing VBT system (RepOne, Metric, Vitruve) publishes a composite
 * stimulus score. The closest validated metric is mechanical work
 * (force * displacement), available via getRepWork() in rep-analytics.
 *
 * @param set - The set to score
 * @param load - Optional external load (kg/lbs/etc.). Falls back to set.loadSettings.weight.
 * @param options - Optional parameters for customization
 * @returns Stimulus score (arbitrary units, higher = more stimulus)
 */
export function getSetStimulusScore(
  set: Set,
  load?: number,
  options?: {
    e1RM?: number;
    decayRate?: number;
    setRIR?: number;
    includeROM?: boolean;
    includeTimeUnderTension?: boolean;
    expectedROM?: number;
    expectedTUT?: number;
  },
): number {
  const resolvedLoad = load ?? getSetLoad(set);
  const decayRate = options?.decayRate ?? DEFAULT_DECAY_RATE;
  const includeROM = options?.includeROM ?? false;
  const includeTUT = options?.includeTimeUnderTension ?? false;
  const perRepRIR = estimatePerRepRIR(set, options?.setRIR);

  let score = 0;

  for (let i = 0; i < set.reps.length; i++) {
    const hardness = getRepHardnessWeight(perRepRIR[i], decayRate);
    let repScore = hardness * resolvedLoad;

    // Optional ROM multiplier
    if (includeROM && options?.expectedROM && options.expectedROM > 0) {
      const repROM = getRepRangeOfMotion(set.reps[i]);
      const romFactor = repROM / options.expectedROM;
      repScore *= romFactor;
    }

    // Optional TUT multiplier
    if (includeTUT && options?.expectedTUT && options.expectedTUT > 0) {
      const repTUT = getRepConcentricTime(set.reps[i]) + getRepEccentricTime(set.reps[i]);
      const tutFactor = repTUT / options.expectedTUT;
      repScore *= tutFactor;
    }

    score += repScore;
  }

  // Normalize by e1RM if provided (makes scores comparable across exercises)
  if (options?.e1RM && options.e1RM > 0) {
    score /= options.e1RM;
  }

  return score;
}
