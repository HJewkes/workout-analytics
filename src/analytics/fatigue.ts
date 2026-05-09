/**
 * Fatigue Analytics - Second-order analytics for set fatigue and consistency.
 *
 * These functions assess fatigue patterns and effort (RIR/RPE) using
 * configurable schemes for classification.
 */

import type { Set } from '@/models/set';
import { getRepRangeOfMotion } from '@/models/rep';
import type { ChangeResult } from '@/analytics/types';
import { computeChange } from '@/analytics/types';
import { getRepConcentricTime } from '@/analytics/rep-analytics';
import {
  getSetFirstRepVelocity,
  getSetLastRepVelocity,
  getSetVelocityLossPct,
  getSetRepVelocities,
  getSetRepROMs,
  getSetFirstRepEccentricVelocity,
  getSetLastRepEccentricVelocity,
  getSetEccentricVelocityChangePct,
} from '@/analytics/set-analytics';
import {
  type StreamingDistribution,
  buildDistribution,
  getCV,
  getZScore,
} from '@/stats/distribution';
import {
  interpolate,
  classifyByBreakpoints,
  DEFAULT_RIR_SCHEME,
  DEFAULT_CONSISTENCY_SCHEME,
  DEFAULT_OUTLIER_SCHEME,
  type InterpolationScheme,
  type BreakpointScheme,
} from '@/stats/schemes';

// =============================================================================
// Types
// =============================================================================

/**
 * Schemes used for fatigue and consistency assessment.
 */
export interface FatigueSchemes {
  /** Velocity loss % to RIR mapping */
  rir?: InterpolationScheme;
  /** CV to consistency classification */
  consistency?: BreakpointScheme<'stable' | 'variable' | 'erratic'>;
  /** Z-score threshold for outlier detection */
  outlier?: BreakpointScheme<boolean>;
}

/**
 * Fatigue index with components and confidence.
 */
export interface FatigueIndex {
  /** Composite fatigue score (0-100) */
  value: number;
  /** Individual change components */
  components: {
    velocityChange: ChangeResult;
    tempoChange: ChangeResult;
    romChange: ChangeResult;
  };
  /** Confidence based on rep count */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Consistency score with CV for each metric.
 */
export interface ConsistencyScore {
  /** Coefficient of variation for velocity */
  velocityCV: number;
  /** Coefficient of variation for ROM */
  romCV: number;
  /** Coefficient of variation for tempo (concentric time) */
  tempoCV: number;
  /** Overall consistency classification */
  overall: 'stable' | 'variable' | 'erratic';
}

/**
 * RIR (Reps in Reserve) / RPE estimate.
 */
export interface RIREstimate {
  /** Estimated reps in reserve (0-6+) */
  rir: number;
  /** Rate of perceived exertion (10 - RIR) */
  rpe: number;
  /** Confidence based on velocity loss magnitude */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Outlier rep information.
 */
export interface OutlierRep {
  /** 1-based rep number */
  repNumber: number;
  /** Which metric is an outlier */
  metric: 'velocity' | 'rom' | 'tempo';
  /** Z-score value */
  zScore: number;
  /** Direction of deviation */
  direction: 'high' | 'low';
}

// =============================================================================
// Change Analytics
// =============================================================================

/**
 * Get velocity change from first to last rep.
 */
export function getSetVelocityChange(
  set: Set,
  historicalDist?: StreamingDistribution
): ChangeResult {
  const first = getSetFirstRepVelocity(set);
  const last = getSetLastRepVelocity(set);
  return computeChange(first, last, historicalDist);
}

/**
 * Get tempo (concentric time) change from first to last rep.
 */
export function getSetTempoChange(set: Set, historicalDist?: StreamingDistribution): ChangeResult {
  const firstRep = set.reps[0];
  const lastRep = set.reps.at(-1);

  const first = firstRep ? getRepConcentricTime(firstRep) : 0;
  const last = lastRep ? getRepConcentricTime(lastRep) : 0;

  return computeChange(first, last, historicalDist);
}

/**
 * Get ROM change from first to last rep.
 */
export function getSetROMChange(set: Set, historicalDist?: StreamingDistribution): ChangeResult {
  const firstRep = set.reps[0];
  const lastRep = set.reps.at(-1);

  const first = firstRep ? getRepRangeOfMotion(firstRep) : 0;
  const last = lastRep ? getRepRangeOfMotion(lastRep) : 0;

  return computeChange(first, last, historicalDist);
}

/**
 * Get eccentric velocity change from first to last rep.
 * Positive percentChange = speeding up (loss of control).
 */
export function getSetEccentricVelocityChange(
  set: Set,
  historicalDist?: StreamingDistribution
): ChangeResult {
  const first = getSetFirstRepEccentricVelocity(set);
  const last = getSetLastRepEccentricVelocity(set);
  return computeChange(first, last, historicalDist);
}

// =============================================================================
// Eccentric Control
// =============================================================================

/**
 * Eccentric control assessment for a set.
 */
export interface EccentricControl {
  /** Eccentric control quality (0-100, higher = better control) */
  score: number;
  /** Eccentric velocity change % (positive = speeding up = bad) */
  eccentricChangePct: number;
  /** Form warning message, or null if form looks good */
  formWarning: string | null;
}

/**
 * Compute eccentric control score for a set.
 *
 * Score of 100 = perfect control (eccentric velocity not increasing).
 * Score decreases as eccentric phase speeds up, indicating loss of control
 * (lifter dropping the weight rather than controlling the negative).
 *
 * Returns 100 if set has fewer than 2 reps (not enough data).
 */
export function getSetEccentricControlScore(set: Set): number {
  if (set.reps.length < 2) return 100;
  const eccentricChangePct = getSetEccentricVelocityChangePct(set);
  // Positive change = speeding up = loss of control
  // Scale: each 1% speedup costs 2 points off of 100
  return Math.max(0, Math.min(100, 100 - eccentricChangePct * 2));
}

/**
 * Get a form warning string if eccentric control is deteriorating.
 *
 * Returns null if form looks acceptable.
 */
export function getSetFormWarning(set: Set): string | null {
  if (set.reps.length < 2) return null;

  const eccentricChangePct = getSetEccentricVelocityChangePct(set);
  const controlScore = getSetEccentricControlScore(set);
  const velocityLossPct = getSetVelocityLossPct(set);

  if (controlScore < 40) {
    return 'Eccentric control declining - slow the negative';
  }
  if (eccentricChangePct > 30 && velocityLossPct > 10) {
    return 'Grinding with loss of control - consider ending set';
  }
  return null;
}

/**
 * Get full eccentric control assessment for a set.
 */
export function getSetEccentricControl(set: Set): EccentricControl {
  return {
    score: getSetEccentricControlScore(set),
    eccentricChangePct: getSetEccentricVelocityChangePct(set),
    formWarning: getSetFormWarning(set),
  };
}

// =============================================================================
// Fatigue Index
// =============================================================================

/**
 * Default weights for fatigue index components.
 * Velocity loss is weighted most heavily as the primary VBT signal.
 */
export const DEFAULT_FATIGUE_WEIGHTS = {
  velocity: 0.6,
  tempo: 0.25,
  rom: 0.15,
};

/**
 * Compute composite fatigue index for a set.
 *
 * The fatigue index combines:
 * - Velocity loss (negative change is bad)
 * - Tempo creep (positive change is bad - getting slower)
 * - ROM decay (negative change is bad)
 */
export function getSetFatigueIndex(
  set: Set,
  weights: { velocity: number; tempo: number; rom: number } = DEFAULT_FATIGUE_WEIGHTS
): FatigueIndex {
  const velocityChange = getSetVelocityChange(set);
  const tempoChange = getSetTempoChange(set);
  const romChange = getSetROMChange(set);

  // Convert changes to fatigue contribution (0-100 scale)
  // Velocity: negative % change = fatigue (cap at 100%)
  const velocityFatigue = Math.min(100, Math.max(0, -velocityChange.percentChange));

  // Tempo: positive % change = fatigue (getting slower)
  const tempoFatigue = Math.min(100, Math.max(0, tempoChange.percentChange));

  // ROM: negative % change = fatigue (shrinking ROM)
  const romFatigue = Math.min(100, Math.max(0, -romChange.percentChange));

  // Weighted composite
  const value =
    velocityFatigue * weights.velocity + tempoFatigue * weights.tempo + romFatigue * weights.rom;

  // Confidence based on rep count
  let confidence: 'high' | 'medium' | 'low';
  if (set.reps.length >= 4) {
    confidence = 'high';
  } else if (set.reps.length >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    value: Math.min(100, Math.max(0, value)),
    components: {
      velocityChange,
      tempoChange,
      romChange,
    },
    confidence,
  };
}

// =============================================================================
// Consistency Analytics
// =============================================================================

/**
 * Build a distribution from concentric times for the set.
 */
function getSetTempoValues(set: Set): number[] {
  return set.reps.map((rep) => getRepConcentricTime(rep));
}

/**
 * Get velocity distribution for the set's reps.
 */
export function getSetVelocityDistribution(set: Set): StreamingDistribution {
  return buildDistribution(getSetRepVelocities(set));
}

/**
 * Get ROM distribution for the set's reps.
 */
export function getSetROMDistribution(set: Set): StreamingDistribution {
  return buildDistribution(getSetRepROMs(set));
}

/**
 * Get tempo distribution for the set's reps.
 */
export function getSetTempoDistribution(set: Set): StreamingDistribution {
  return buildDistribution(getSetTempoValues(set));
}

/**
 * Get consistency score for the set.
 */
export function getSetConsistencyScore(set: Set, schemes?: FatigueSchemes): ConsistencyScore {
  const consistencyScheme = schemes?.consistency ?? DEFAULT_CONSISTENCY_SCHEME;

  const velocityDist = getSetVelocityDistribution(set);
  const romDist = getSetROMDistribution(set);
  const tempoDist = getSetTempoDistribution(set);

  const velocityCV = getCV(velocityDist);
  const romCV = getCV(romDist);
  const tempoCV = getCV(tempoDist);

  // Overall is based on the worst (highest) CV
  const maxCV = Math.max(velocityCV, romCV, tempoCV);
  const overall = classifyByBreakpoints(maxCV, consistencyScheme);

  return {
    velocityCV,
    romCV,
    tempoCV,
    overall,
  };
}

// =============================================================================
// Outlier Detection
// =============================================================================

/**
 * Find reps that are statistical outliers within the set.
 */
export function findOutlierReps(set: Set, schemes?: FatigueSchemes): OutlierRep[] {
  const outlierScheme = schemes?.outlier ?? DEFAULT_OUTLIER_SCHEME;
  const outliers: OutlierRep[] = [];

  if (set.reps.length < 3) {
    return outliers; // Need at least 3 reps for meaningful outlier detection
  }

  const velocityDist = getSetVelocityDistribution(set);
  const romDist = getSetROMDistribution(set);
  const tempoDist = getSetTempoDistribution(set);

  const velocities = getSetRepVelocities(set);
  const roms = getSetRepROMs(set);
  const tempos = getSetTempoValues(set);

  for (let i = 0; i < set.reps.length; i++) {
    const repNumber = i + 1;

    // Check velocity
    const velZScore = getZScore(velocityDist, velocities[i]);
    if (classifyByBreakpoints(Math.abs(velZScore), outlierScheme)) {
      outliers.push({
        repNumber,
        metric: 'velocity',
        zScore: velZScore,
        direction: velZScore > 0 ? 'high' : 'low',
      });
    }

    // Check ROM
    const romZScore = getZScore(romDist, roms[i]);
    if (classifyByBreakpoints(Math.abs(romZScore), outlierScheme)) {
      outliers.push({
        repNumber,
        metric: 'rom',
        zScore: romZScore,
        direction: romZScore > 0 ? 'high' : 'low',
      });
    }

    // Check tempo
    const tempoZScore = getZScore(tempoDist, tempos[i]);
    if (classifyByBreakpoints(Math.abs(tempoZScore), outlierScheme)) {
      outliers.push({
        repNumber,
        metric: 'tempo',
        zScore: tempoZScore,
        direction: tempoZScore > 0 ? 'high' : 'low',
      });
    }
  }

  return outliers;
}

// =============================================================================
// RIR/RPE Estimation
// =============================================================================

/**
 * Estimate RIR (Reps in Reserve) from velocity loss.
 */
export function estimateSetRIR(set: Set, schemes?: FatigueSchemes): RIREstimate {
  const rirScheme = schemes?.rir ?? DEFAULT_RIR_SCHEME;
  const velLossPct = getSetVelocityLossPct(set);

  // Interpolate RIR from velocity loss
  const rir = interpolate(Math.abs(velLossPct), rirScheme);

  // Confidence based on velocity loss magnitude
  let confidence: 'high' | 'medium' | 'low';
  const absVelLoss = Math.abs(velLossPct);
  if (absVelLoss > 20) {
    confidence = 'high'; // Clear fatigue signal
  } else if (absVelLoss > 10) {
    confidence = 'medium';
  } else {
    confidence = 'low'; // Not enough fatigue to be confident
  }

  return {
    rir: Math.max(0, Math.min(6, rir)),
    rpe: Math.max(4, Math.min(10, 10 - rir)),
    confidence,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick check if a set shows significant fatigue (velocity loss > threshold).
 */
export function isSetFatigued(set: Set, threshold: number = 20): boolean {
  return getSetVelocityLossPct(set) > threshold;
}

/**
 * Get a simple fatigue summary for quick display.
 */
export interface FatigueSummary {
  velocityLossPct: number;
  rir: number;
  rpe: number;
  consistency: 'stable' | 'variable' | 'erratic';
  fatigueLevel: 'low' | 'moderate' | 'high';
}

/**
 * Get a quick fatigue summary for the set.
 */
export function getSetFatigueSummary(set: Set): FatigueSummary {
  const velocityLossPct = getSetVelocityLossPct(set);
  const rirEstimate = estimateSetRIR(set);
  const consistency = getSetConsistencyScore(set);

  let fatigueLevel: 'low' | 'moderate' | 'high';
  if (velocityLossPct < 15) {
    fatigueLevel = 'low';
  } else if (velocityLossPct < 30) {
    fatigueLevel = 'moderate';
  } else {
    fatigueLevel = 'high';
  }

  return {
    velocityLossPct,
    rir: rirEstimate.rir,
    rpe: rirEstimate.rpe,
    consistency: consistency.overall,
    fatigueLevel,
  };
}

// =============================================================================
// VBT Autoregulation Spec §6.2 — Set-Level Fatigue Index
// =============================================================================

/**
 * Default weights for VBT spec fatigue index (§6.2).
 * Velocity loss is the primary signal; tempo creep and ROM shrinkage augment it.
 */
export const VBT_DEFAULT_FATIGUE_WEIGHTS = {
  velLoss: 0.7,
  tempoCreep: 0.15,
  romShrink: 0.15,
} as const;

/**
 * Result of computeSetFatigueIndex per VBT autoregulation spec §6.2.
 */
export interface SetFatigueIndexResult {
  /** Composite fatigue index in [0, 1]. */
  fatigueIndex: number;
  /** Velocity loss ratio in [0, 1]: (V1 - VLast) / V1. */
  velLossPct: number;
  /**
   * Concentric tempo creep ratio: (t_con_last - t_con_first) / t_con_first.
   * Null when the set has fewer than 2 reps or t_con_first is zero.
   */
  tempoCrepRatio: number | null;
  /**
   * ROM shrinkage ratio: max(0, (rom_first - rom_last) / rom_first).
   * Null when the set has fewer than 2 reps or rom_first is zero.
   */
  romRatio: number | null;
}

/**
 * Compute set-level fatigue index per VBT autoregulation spec §6.2.
 *
 * Base signal: velocity loss percentage expressed as a ratio (0..1).
 * Augmentations (both clamped to [0, 1] before weighting):
 *   - Tempo creep: concentric time increase from first to last rep.
 *   - ROM shrinkage: range-of-motion decrease from first to last rep.
 *
 * When an augmentation cannot be computed (single-rep set, zero baseline),
 * its weight is redistributed proportionally to the remaining components
 * so the weights always sum to 1.
 *
 * Returns `fatigueIndex` clamped to [0, 1].
 */
export function computeSetFatigueIndex(
  set: Set,
  opts?: {
    velLossWeight?: number;
    tempoCrepWeight?: number;
    romShrinkWeight?: number;
  }
): SetFatigueIndexResult {
  const wVel = opts?.velLossWeight ?? VBT_DEFAULT_FATIGUE_WEIGHTS.velLoss;
  const wTempo = opts?.tempoCrepWeight ?? VBT_DEFAULT_FATIGUE_WEIGHTS.tempoCreep;
  const wRom = opts?.romShrinkWeight ?? VBT_DEFAULT_FATIGUE_WEIGHTS.romShrink;

  // Velocity loss: already 0-100 from getSetVelocityLossPct; convert to 0..1 ratio.
  const velLossRaw = getSetVelocityLossPct(set) / 100;
  const velLossPct = Math.min(1, Math.max(0, velLossRaw));

  // Tempo creep and ROM: require at least 2 reps.
  let tempoCrepRatio: number | null = null;
  let romRatio: number | null = null;

  const firstRep = set.reps[0];
  const lastRep = set.reps.at(-1);

  if (firstRep && lastRep && set.reps.length >= 2) {
    const tFirst = getRepConcentricTime(firstRep);
    const tLast = getRepConcentricTime(lastRep);
    if (tFirst > 0) {
      tempoCrepRatio = Math.min(1, Math.max(0, (tLast - tFirst) / tFirst));
    }

    const romFirst = getRepRangeOfMotion(firstRep);
    const romLast = getRepRangeOfMotion(lastRep);
    if (romFirst > 0) {
      romRatio = Math.min(1, Math.max(0, (romFirst - romLast) / romFirst));
    }
  }

  // Redistribute weight from unavailable components.
  const tempoAvail = tempoCrepRatio !== null;
  const romAvail = romRatio !== null;

  const effectiveWTempo = tempoAvail ? wTempo : 0;
  const effectiveWRom = romAvail ? wRom : 0;
  const missing = (tempoAvail ? 0 : wTempo) + (romAvail ? 0 : wRom);
  // Distribute missing weight back to velocity (primary signal).
  const effectiveWVel = wVel + missing;

  const fatigueIndex = Math.min(
    1,
    Math.max(
      0,
      velLossPct * effectiveWVel +
        (tempoCrepRatio ?? 0) * effectiveWTempo +
        (romRatio ?? 0) * effectiveWRom
    )
  );

  return { fatigueIndex, velLossPct, tempoCrepRatio, romRatio };
}

// =============================================================================
// VBT Autoregulation Spec §6.3 — Within-Session Fatigue State
// =============================================================================

/** Default EWMA decay per spec (tracks changes over ~2-3 sets). */
export const VBT_DEFAULT_FATIGUE_LAMBDA = 0.4;

/**
 * Update within-session fatigue state (EWMA) per VBT autoregulation spec §6.3.
 *
 * F_new = λ × (FI_set × intensityRatio) + (1 − λ) × F_prev
 *
 * intensityRatio is the set's working weight relative to estimated 1RM,
 * clamped to [0.3, 1.0]. Heavier sets carry proportionally more fatigue weight.
 *
 * Both inputs and output are clamped to [0, 1].
 *
 * @param prevF - Previous session fatigue state in [0, 1].
 * @param fiSet - Set fatigue index from computeSetFatigueIndex in [0, 1].
 * @param intensityRatio - workingWeight / e1RM, clamped internally to [0.3, 1.0].
 * @param lambda - EWMA decay coefficient (default 0.4).
 * @returns Updated session fatigue state in [0, 1].
 */
export function updateSessionFatigueState(
  prevF: number,
  fiSet: number,
  intensityRatio: number,
  lambda: number = VBT_DEFAULT_FATIGUE_LAMBDA
): number {
  const clampedPrevF = Math.min(1, Math.max(0, prevF));
  const clampedFiSet = Math.min(1, Math.max(0, fiSet));
  const clampedIntensity = Math.min(1.0, Math.max(0.3, intensityRatio));

  const weighted = clampedFiSet * clampedIntensity;
  const nextF = lambda * weighted + (1 - lambda) * clampedPrevF;

  return Math.min(1, Math.max(0, nextF));
}
