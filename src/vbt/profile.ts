/**
 * LV Profile Builder - Load-Velocity profile construction using OLS regression.
 *
 * Builds a linear load-velocity profile from observed data points,
 * enabling velocity prediction, load estimation, and 1RM estimation.
 *
 * Research basis: Linear regression is recommended over polynomial
 * for LV profiling (PLoS ONE 2019). Machine-based exercises show
 * R² > 0.93 for individual profiles (PLoS ONE 2019).
 */

import { DEFAULT_MVT } from '@/vbt/constants';

// =============================================================================
// Types
// =============================================================================

/**
 * A single observed load-velocity data point.
 * Typically from the first rep of a set (least fatigued).
 */
export interface LoadVelocityDataPoint {
  /** Load in arbitrary units (kg, lbs, stack position) */
  readonly load: number;
  /** Mean concentric velocity in m/s */
  readonly velocity: number;
  /** Unix timestamp in ms (optional, for recency weighting) */
  readonly timestamp?: number;
}

/**
 * Immutable load-velocity profile built from data points.
 *
 * The linear model is: velocity = slope * load + intercept
 * (slope is negative since velocity decreases with load).
 */
export interface LoadVelocityProfile {
  readonly dataPoints: readonly LoadVelocityDataPoint[];
  readonly slope: number;
  readonly intercept: number;
  readonly rSquared: number;
  readonly estimated1RM: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly mvt: number;
}

// =============================================================================
// OLS Regression (internal)
// =============================================================================

interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
}

/**
 * Ordinary least squares linear regression.
 * Fits y = slope * x + intercept.
 */
function olsRegression(xs: number[], ys: number[]): RegressionResult {
  const n = xs.length;

  if (n === 0) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  if (n === 1) {
    return { slope: 0, intercept: ys[0], rSquared: 0 };
  }

  // Compute means
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  // Compute slope and intercept
  let ssXY = 0;
  let ssXX = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    ssXY += dx * (ys[i] - meanY);
    ssXX += dx * dx;
  }

  // If all x values are the same, slope is 0
  if (ssXX === 0) {
    return { slope: 0, intercept: meanY, rSquared: 0 };
  }

  const slope = ssXY / ssXX;
  const intercept = meanY - slope * meanX;

  // Compute R²
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - predicted) ** 2;
  }

  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { slope, intercept, rSquared };
}

// =============================================================================
// Profile Functions
// =============================================================================

/**
 * Build a load-velocity profile from observed data points using OLS regression.
 *
 * The profile models the linear relationship: velocity = slope * load + intercept
 *
 * Confidence is determined by:
 * - 'high': R² >= 0.90 and >= 3 data points
 * - 'medium': R² >= 0.70 and >= 2 data points
 * - 'low': everything else
 *
 * @param dataPoints - Observed load-velocity pairs
 * @param mvt - Minimum velocity threshold (default 0.17 m/s)
 * @returns Immutable LoadVelocityProfile
 */
export function buildProfile(
  dataPoints: LoadVelocityDataPoint[],
  mvt: number = DEFAULT_MVT,
): LoadVelocityProfile {
  const loads = dataPoints.map((dp) => dp.load);
  const velocities = dataPoints.map((dp) => dp.velocity);

  const { slope, intercept, rSquared } = olsRegression(loads, velocities);

  // Estimate 1RM: solve for load where velocity = MVT
  // velocity = slope * load + intercept
  // mvt = slope * load + intercept
  // load = (mvt - intercept) / slope
  let estimated1RM = 0;
  if (slope !== 0) {
    estimated1RM = (mvt - intercept) / slope;
    // Sanity: 1RM should be positive
    if (estimated1RM < 0) estimated1RM = 0;
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (rSquared >= 0.90 && dataPoints.length >= 3) {
    confidence = 'high';
  } else if (rSquared >= 0.70 && dataPoints.length >= 2) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    dataPoints: [...dataPoints],
    slope,
    intercept,
    rSquared,
    estimated1RM,
    confidence,
    mvt,
  };
}

/**
 * Predict mean concentric velocity for a given load using the profile.
 *
 * @param profile - The LV profile
 * @param load - Load to predict velocity for
 * @returns Predicted velocity in m/s (clamped to >= 0)
 */
export function predictVelocity(profile: LoadVelocityProfile, load: number): number {
  const predicted = profile.slope * load + profile.intercept;
  return Math.max(0, predicted);
}

/**
 * Estimate the load needed to achieve a target velocity.
 *
 * @param profile - The LV profile
 * @param targetVelocity - Desired velocity in m/s
 * @returns Estimated load (clamped to >= 0), or 0 if slope is 0
 */
export function estimateLoad(profile: LoadVelocityProfile, targetVelocity: number): number {
  if (profile.slope === 0) return 0;
  const load = (targetVelocity - profile.intercept) / profile.slope;
  return Math.max(0, load);
}

/**
 * Add a data point to an existing profile, rebuilding the regression.
 * Returns a new immutable profile.
 *
 * @param profile - Existing profile
 * @param point - New data point to add
 * @returns New profile with the additional data point
 */
export function addDataPoint(
  profile: LoadVelocityProfile,
  point: LoadVelocityDataPoint,
): LoadVelocityProfile {
  return buildProfile([...profile.dataPoints, point], profile.mvt);
}
