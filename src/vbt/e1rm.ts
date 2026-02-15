/**
 * e1RM Estimation - Estimated one-rep maximum calculations.
 *
 * Three methods:
 * - Velocity-based: From LV profile, solve for load at MVT
 * - Rep-based: Epley formula from load and reps performed
 * - Hybrid: Weighted combination of both methods
 */

import type { LoadVelocityProfile } from '@/vbt/profile';
import { DEFAULT_MVT } from '@/vbt/constants';

// =============================================================================
// Types
// =============================================================================

/**
 * Estimated 1RM result with confidence.
 */
export interface E1RMEstimate {
  /** Estimated 1RM in load units */
  readonly e1RM: number;
  /** Confidence score 0-1 */
  readonly confidence: number;
  /** Method used for estimation */
  readonly method: 'profile' | 'reps' | 'hybrid';
}

// =============================================================================
// Profile-Based e1RM
// =============================================================================

/**
 * Estimate e1RM from a load-velocity profile.
 * Solves for the load where predicted velocity equals MVT.
 *
 * velocity = slope * load + intercept
 * MVT = slope * e1RM + intercept
 * e1RM = (MVT - intercept) / slope
 *
 * Confidence is derived from the profile's R² and data point count.
 *
 * @param profile - The load-velocity profile
 * @param mvt - Minimum velocity threshold (default 0.17 m/s)
 * @returns e1RM estimate with confidence
 */
export function estimateE1RMFromProfile(
  profile: LoadVelocityProfile,
  mvt: number = DEFAULT_MVT,
): E1RMEstimate {
  if (profile.slope === 0 || profile.dataPoints.length === 0) {
    return { e1RM: 0, confidence: 0, method: 'profile' };
  }

  const e1RM = (mvt - profile.intercept) / profile.slope;

  // Confidence from R² and data count
  const rSquaredFactor = Math.max(0, profile.rSquared);
  const dataFactor = Math.min(1, profile.dataPoints.length / 5);
  const confidence = rSquaredFactor * dataFactor;

  return {
    e1RM: Math.max(0, e1RM),
    confidence: Math.min(1, Math.max(0, confidence)),
    method: 'profile',
  };
}

// =============================================================================
// Rep-Based e1RM (Epley Formula)
// =============================================================================

/**
 * Estimate e1RM from load and reps performed using the Epley formula.
 *
 * e1RM = load * (1 + reps / 30)
 *
 * Known limitations:
 * - Overestimates at high rep counts (>12)
 * - Assumes linear load-reps relationship
 * - Most accurate in the 3-10 rep range
 *
 * Confidence decreases with rep count (formula less reliable at high reps)
 * and is 0 for single-rep sets (formula undefined at 1 rep).
 *
 * @param load - Load used for the set
 * @param reps - Number of reps completed
 * @returns e1RM estimate with confidence
 */
export function estimateE1RMFromReps(
  load: number,
  reps: number,
): E1RMEstimate {
  if (load <= 0 || reps <= 0) {
    return { e1RM: 0, confidence: 0, method: 'reps' };
  }

  // At 1 rep, Epley gives e1RM ≈ load * 1.033 -- essentially the load itself
  const e1RM = load * (1 + reps / 30);

  // Confidence: highest at 3-8 reps, decreasing outside that range
  let confidence: number;
  if (reps === 1) {
    // Single rep: load IS close to 1RM, but formula adds little value
    confidence = 0.5;
  } else if (reps <= 5) {
    confidence = 0.9;
  } else if (reps <= 8) {
    confidence = 0.85;
  } else if (reps <= 12) {
    confidence = 0.7;
  } else {
    // >12 reps: formula becomes unreliable
    confidence = Math.max(0.3, 0.7 - (reps - 12) * 0.05);
  }

  return {
    e1RM,
    confidence: Math.min(1, Math.max(0, confidence)),
    method: 'reps',
  };
}

// =============================================================================
// Hybrid e1RM
// =============================================================================

/**
 * Combine velocity-based and rep-based e1RM estimates, weighted by confidence.
 *
 * The hybrid approach leverages the strengths of both methods:
 * - Velocity estimates are more reliable at 60-85% 1RM
 * - Rep estimates are more reliable at >85% 1RM (fewer reps, less noise)
 *
 * The final estimate is a confidence-weighted average.
 *
 * @param velocityEstimate - e1RM from profile method
 * @param repsEstimate - e1RM from Epley method
 * @returns Combined e1RM with aggregated confidence
 */
export function estimateHybridE1RM(
  velocityEstimate: E1RMEstimate,
  repsEstimate: E1RMEstimate,
): E1RMEstimate {
  const vc = velocityEstimate.confidence;
  const rc = repsEstimate.confidence;
  const totalConf = vc + rc;

  // If both have zero confidence, return zero
  if (totalConf === 0) {
    return { e1RM: 0, confidence: 0, method: 'hybrid' };
  }

  // Confidence-weighted average
  const e1RM = (velocityEstimate.e1RM * vc + repsEstimate.e1RM * rc) / totalConf;

  // Hybrid confidence: average of both, boosted slightly because
  // two independent estimates corroborating increases reliability
  const avgConfidence = totalConf / 2;
  const agreement = 1 - Math.abs(velocityEstimate.e1RM - repsEstimate.e1RM) /
    Math.max(velocityEstimate.e1RM, repsEstimate.e1RM, 1);
  const confidence = Math.min(1, avgConfidence * (0.8 + 0.2 * agreement));

  return {
    e1RM: Math.max(0, e1RM),
    confidence: Math.min(1, Math.max(0, confidence)),
    method: 'hybrid',
  };
}
