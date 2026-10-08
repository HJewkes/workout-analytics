/**
 * e1RM Estimation - Estimated one-rep maximum calculations.
 *
 * Three methods:
 * - Velocity-based: From LV profile, solve for load at MVT
 * - Rep-based: Epley formula from load and reps performed
 * - Hybrid: Weighted combination of both methods
 */

import { isPlausibleE1RM, type LoadVelocityProfile } from './profile.js';
import { DEFAULT_MVT } from './constants.js';

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
 * Returns e1RM 0 and confidence 0 when the slope is not negative (zero,
 * positive or NaN), and when the extrapolated e1RM exceeds
 * MAX_E1RM_TO_MAX_LOAD_RATIO (5x) times the heaviest load in the profile,
 * which is what a near-zero negative slope produces.
 *
 * @param profile - The load-velocity profile
 * @param mvt - Minimum velocity threshold (default 0.17 m/s)
 * @returns e1RM estimate with confidence
 */
export function estimateE1RMFromProfile(
  profile: LoadVelocityProfile,
  mvt: number = DEFAULT_MVT
): E1RMEstimate {
  if (!(profile.slope < 0) || profile.dataPoints.length === 0) {
    return { e1RM: 0, confidence: 0, method: 'profile' };
  }

  const e1RM = (mvt - profile.intercept) / profile.slope;
  if (!isPlausibleE1RM(e1RM, profile.dataPoints)) {
    return { e1RM: 0, confidence: 0, method: 'profile' };
  }

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
 * Confidence decreases with rep count (formula less reliable at high reps).
 * Epley assumes a set taken to or near failure. Under that premise a single
 * is a direct max: the formula extrapolates nothing and only adds 1/30 of
 * the load, so a single gets the same confidence as the 2-5 rep band.
 *
 * @param load - Load used for the set
 * @param reps - Number of reps completed
 * @returns e1RM estimate with confidence
 */
export function estimateE1RMFromReps(load: number, reps: number): E1RMEstimate {
  if (load <= 0 || reps <= 0) {
    return { e1RM: 0, confidence: 0, method: 'reps' };
  }

  // At 1 rep, Epley gives e1RM ≈ load * 1.033 -- essentially the load itself
  const e1RM = load * (1 + reps / 30);

  // Confidence: highest at 1-5 reps, decreasing as reps rise
  let confidence: number;
  if (reps <= 5) {
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
 * Confidence treats the two as independent corroborating estimates,
 * 1 - (1 - vc)(1 - rc), which is never below the stronger input. It is then
 * cut by their relative disagreement, scaled by weaker / stronger so that a
 * near-zero-confidence input (which barely moves the e1RM) barely moves the
 * confidence either. Two agreeing estimates are therefore at least as
 * confident as the stronger one; two equally confident estimates far apart
 * are less confident than either.
 *
 * @param velocityEstimate - e1RM from profile method
 * @param repsEstimate - e1RM from Epley method
 * @returns Combined e1RM with aggregated confidence
 */
export function estimateHybridE1RM(
  velocityEstimate: E1RMEstimate,
  repsEstimate: E1RMEstimate
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

  return {
    e1RM: Math.max(0, e1RM),
    confidence: hybridConfidence(velocityEstimate, repsEstimate),
    method: 'hybrid',
  };
}

function hybridConfidence(a: E1RMEstimate, b: E1RMEstimate): number {
  const stronger = Math.max(a.confidence, b.confidence);
  const weaker = Math.min(a.confidence, b.confidence);
  const corroborated = 1 - (1 - a.confidence) * (1 - b.confidence);
  const disagreement = Math.abs(a.e1RM - b.e1RM) / Math.max(a.e1RM, b.e1RM, 1);
  const confidence = corroborated * (1 - disagreement * (weaker / stronger));
  return Math.min(1, Math.max(0, confidence));
}
