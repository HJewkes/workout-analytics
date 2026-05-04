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
export function getSetTempoChange(
  set: Set,
  historicalDist?: StreamingDistribution
): ChangeResult {
  const firstRep = set.reps[0];
  const lastRep = set.reps.at(-1);

  const first = firstRep ? getRepConcentricTime(firstRep) : 0;
  const last = lastRep ? getRepConcentricTime(lastRep) : 0;

  return computeChange(first, last, historicalDist);
}

/**
 * Get ROM change from first to last rep.
 */
export function getSetROMChange(
  set: Set,
  historicalDist?: StreamingDistribution
): ChangeResult {
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
    velocityFatigue * weights.velocity +
    tempoFatigue * weights.tempo +
    romFatigue * weights.rom;

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
export function getSetConsistencyScore(
  set: Set,
  schemes?: FatigueSchemes
): ConsistencyScore {
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
export function findOutlierReps(
  set: Set,
  schemes?: FatigueSchemes
): OutlierRep[] {
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
export function estimateSetRIR(
  set: Set,
  schemes?: FatigueSchemes
): RIREstimate {
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
