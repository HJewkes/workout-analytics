/**
 * Readiness Adjustments - Concrete weight/volume recommendations from a readiness estimate.
 *
 * Bridges the analytics readiness estimate to actionable in-session planner nudges:
 * reduce weight, skip a set, push harder, or rest. This is the autoregulation
 * loop input (spec §4) that was present in v0 but intentionally deferred from the
 * initial src/ port of computeReadiness.
 */

import type { ReadinessEstimate } from '@/analytics/session';

// =============================================================================
// Types
// =============================================================================

/**
 * Concrete weight and volume recommendations derived from a readiness estimate.
 *
 * The MCP layer is responsible for rounding weightAdjustmentLbs to the nearest
 * available plate increment before presenting to the user.
 */
export interface ReadinessAdjustments {
  /**
   * Weight adjustment relative to planned target in lbs.
   * Negative = reduce load; positive = add load.
   * The MCP layer should round to the nearest 5 lb plate increment.
   */
  readonly weightAdjustmentLbs: number;
  /**
   * Number of sets to skip (negative) or add (positive).
   * 0 = proceed as planned.
   */
  readonly volumeAdjustmentSets: number;
  /** Categorical recommendation for human-facing UX. */
  readonly recommendation: 'reduce_load' | 'reduce_volume' | 'maintain' | 'push' | 'rest_day';
  /** Confidence in the recommendation, propagated from the underlying readiness estimate. */
  readonly confidence: 'low' | 'medium' | 'high';
  /** Free-form rationale for coaching display. */
  readonly reasoning: string;
}

/**
 * Inputs for computing readiness-based adjustments.
 */
export interface ReadinessAdjustmentInputs {
  /** Output from computeReadiness or equivalent. */
  readonly readiness: ReadinessEstimate;
  /** Planned working weight for next session in lbs. */
  readonly plannedWeightLbs: number;
  /** Planned set count for the planned exercise. */
  readonly plannedSets: number;
  /**
   * Optional recent fatigue from EWMA session history (0..1).
   * High fatigue suppresses the 'push' recommendation even when readiness is green.
   */
  readonly recentFatigue?: number;
  /**
   * Days since the athlete last trained this movement.
   * > 21 days triggers a rest-day / deload recommendation regardless of readiness.
   */
  readonly daysSinceLastTrained?: number;
}

// =============================================================================
// Constants
// =============================================================================

/** Velocity-ratio thresholds — kept in sync with computeReadiness. */
const RATIO = {
  /** Below this: rest_day override. */
  criticalLow: 0.2,
  /** Below this: consider reduce_volume. */
  reduceVolume: 0.4,
  /** Below this: reduce_load band. */
  reduceLoad: 0.6,
  /** Below this: maintain band. */
  maintain: 0.8,
  // >= 0.8 → push candidate
} as const;

/** Recent-fatigue ceiling above which we suppress the push recommendation. */
const MAX_FATIGUE_FOR_PUSH = 0.3;

/** Days-since-trained ceiling above which a rest/deload is recommended. */
const MAX_DAYS_SINCE_TRAINED = 21;

// =============================================================================
// Main function
// =============================================================================

/**
 * Compute actionable weight and volume adjustments from a readiness estimate.
 *
 * Decision rules (lower scores win; evaluated in priority order):
 *  1. daysSinceLastTrained > 21  → rest_day (deload — long layoff)
 *  2. velocityRatio < 0.2        → rest_day (severely under-recovered)
 *  3. velocityRatio < 0.4        → reduce_volume (skip top set, weight unchanged)
 *  4. velocityRatio < 0.6        → reduce_load (cut 5–10 lb, no volume change)
 *  5. velocityRatio < 0.8        → maintain (proceed as planned)
 *  6. velocityRatio >= 0.8 AND recentFatigue < 0.3 → push (+5 lb or +1 set)
 *  7. velocityRatio >= 0.8 AND recentFatigue >= 0.3 → maintain (green but fatigued)
 *
 * @param inputs - Readiness estimate + session planning context
 * @returns Concrete weight, volume, and categorical adjustments
 */
export function computeReadinessAdjustments(
  inputs: ReadinessAdjustmentInputs
): ReadinessAdjustments {
  const { readiness, plannedWeightLbs, plannedSets, recentFatigue = 0, daysSinceLastTrained } = inputs;
  const { velocityRatio, confidence: rawConfidence } = readiness;

  // Map numeric confidence to categorical
  const confidence = mapConfidence(rawConfidence);

  // Priority 1: long layoff override — recommend deload regardless of readiness
  if (daysSinceLastTrained !== undefined && daysSinceLastTrained > MAX_DAYS_SINCE_TRAINED) {
    return {
      weightAdjustmentLbs: -Math.round(plannedWeightLbs * 0.1 / 5) * 5, // ~10 % deload, 5 lb steps
      volumeAdjustmentSets: -1,
      recommendation: 'rest_day',
      confidence: 'medium',
      reasoning: `${daysSinceLastTrained} days since last session — ease back in with reduced load and volume`,
    };
  }

  // Priority 2: critically low readiness — rest day
  if (velocityRatio < RATIO.criticalLow) {
    return {
      weightAdjustmentLbs: -10,
      volumeAdjustmentSets: -(Math.max(0, plannedSets - 1)),
      recommendation: 'rest_day',
      confidence,
      reasoning: 'Velocity severely below baseline — body needs recovery; consider a full rest day or very light technique work',
    };
  }

  // Priority 3: low readiness — skip top set, keep weight
  if (velocityRatio < RATIO.reduceVolume) {
    return {
      weightAdjustmentLbs: 0,
      volumeAdjustmentSets: -1,
      recommendation: 'reduce_volume',
      confidence,
      reasoning: `Velocity at ${Math.round(velocityRatio * 100)}% of baseline — fatigue accumulating; cut top set and move on`,
    };
  }

  // Priority 4: moderate shortfall — reduce load
  if (velocityRatio < RATIO.reduceLoad) {
    // Scale reduction linearly in the 0.4-0.6 band: 0.4 → -10, 0.6 → -5
    const bandProgress = (velocityRatio - RATIO.reduceVolume) / (RATIO.reduceLoad - RATIO.reduceVolume); // 0..1
    const lbReduction = Math.round((10 - bandProgress * 5) / 5) * 5; // 5 or 10
    return {
      weightAdjustmentLbs: -lbReduction,
      volumeAdjustmentSets: 0,
      recommendation: 'reduce_load',
      confidence,
      reasoning: `Velocity at ${Math.round(velocityRatio * 100)}% of baseline — reduce working weight ${lbReduction} lb today`,
    };
  }

  // Priority 5: mild shortfall — maintain
  if (velocityRatio < RATIO.maintain) {
    return {
      weightAdjustmentLbs: 0,
      volumeAdjustmentSets: 0,
      recommendation: 'maintain',
      confidence,
      reasoning: `Velocity at ${Math.round(velocityRatio * 100)}% of baseline — proceed as planned`,
    };
  }

  // Priority 6 / 7: green readiness — push or maintain based on fatigue
  if (recentFatigue >= MAX_FATIGUE_FOR_PUSH) {
    return {
      weightAdjustmentLbs: 0,
      volumeAdjustmentSets: 0,
      recommendation: 'maintain',
      confidence,
      reasoning: `Readiness is strong but recent fatigue (${Math.round(recentFatigue * 100)}%) is elevated — maintain planned load`,
    };
  }

  return {
    weightAdjustmentLbs: 5,
    volumeAdjustmentSets: 0,
    recommendation: 'push',
    confidence,
    reasoning: `Velocity at ${Math.round(velocityRatio * 100)}% of baseline and fatigue is low — add 5 lb or one bonus set`,
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

function mapConfidence(numeric: number): 'low' | 'medium' | 'high' {
  if (numeric >= 0.75) return 'high';
  if (numeric >= 0.45) return 'medium';
  return 'low';
}
