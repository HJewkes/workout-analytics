/**
 * Advanced LV Profile Fitting - Weighted least squares with robust regression.
 *
 * Enhancement over the basic OLS in profile.ts:
 * - Recency weighting (exponential decay by timestamp)
 * - Quality weighting (by R² of source measurements)
 * - Robust regression (Huber loss via IRLS)
 * - Uncertainty estimates for slope and intercept
 */

import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Types
// =============================================================================

/**
 * Options for advanced profile fitting.
 */
export interface FittingOptions {
  /** Weight more recent data points more heavily (exponential decay) */
  weightByRecency?: boolean;
  /** Weight by quality metric (if data points have quality scores) */
  weightByQuality?: boolean;
  /** Use Huber loss for robust regression (resists outliers) */
  robustRegression?: boolean;
  /** Maximum age of data points in ms (older points are excluded) */
  maxAge?: number;
  /** Half-life for recency weighting in ms (default 30 days) */
  recencyHalfLife?: number;
  /** Quality weights parallel to data points (0-1) */
  qualityWeights?: readonly number[];
  /** Huber delta parameter (default 1.345 for 95% efficiency) */
  huberDelta?: number;
}

/**
 * Result of advanced profile fitting.
 */
export interface FittingResult {
  readonly slope: number;
  readonly intercept: number;
  readonly rSquared: number;
  readonly uncertainty: { readonly slope: number; readonly intercept: number };
  readonly dataPointsUsed: number;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Weighted least squares linear regression.
 * Fits y = slope * x + intercept with per-point weights.
 */
function weightedLeastSquares(
  xs: number[],
  ys: number[],
  weights: number[]
): { slope: number; intercept: number } {
  const n = xs.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: ys[0] };

  let sumW = 0;
  let sumWX = 0;
  let sumWY = 0;
  let sumWXX = 0;
  let sumWXY = 0;

  for (let i = 0; i < n; i++) {
    const w = weights[i];
    sumW += w;
    sumWX += w * xs[i];
    sumWY += w * ys[i];
    sumWXX += w * xs[i] * xs[i];
    sumWXY += w * xs[i] * ys[i];
  }

  const denom = sumW * sumWXX - sumWX * sumWX;
  if (Math.abs(denom) < 1e-12) {
    return { slope: 0, intercept: sumW > 0 ? sumWY / sumW : 0 };
  }

  const slope = (sumW * sumWXY - sumWX * sumWY) / denom;
  const intercept = (sumWY - slope * sumWX) / sumW;

  return { slope, intercept };
}

/**
 * Compute R² for a weighted regression.
 */
function computeWeightedRSquared(
  xs: number[],
  ys: number[],
  weights: number[],
  slope: number,
  intercept: number
): number {
  const n = xs.length;
  if (n < 2) return 0;

  let sumW = 0;
  let sumWY = 0;
  for (let i = 0; i < n; i++) {
    sumW += weights[i];
    sumWY += weights[i] * ys[i];
  }
  const meanY = sumW > 0 ? sumWY / sumW : 0;

  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * xs[i] + intercept;
    ssTot += weights[i] * (ys[i] - meanY) ** 2;
    ssRes += weights[i] * (ys[i] - predicted) ** 2;
  }

  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/**
 * Compute standard errors for slope and intercept.
 */
function computeUncertainty(
  xs: number[],
  ys: number[],
  weights: number[],
  slope: number,
  intercept: number
): { slope: number; intercept: number } {
  const n = xs.length;
  if (n < 3) return { slope: Infinity, intercept: Infinity };

  let sumW = 0;
  let sumWX = 0;
  let sumWXX = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const w = weights[i];
    sumW += w;
    sumWX += w * xs[i];
    sumWXX += w * xs[i] * xs[i];
    const predicted = slope * xs[i] + intercept;
    ssRes += w * (ys[i] - predicted) ** 2;
  }

  const mse = ssRes / (n - 2);
  const denom = sumW * sumWXX - sumWX * sumWX;

  if (Math.abs(denom) < 1e-12) {
    return { slope: Infinity, intercept: Infinity };
  }

  const slopeVar = (sumW * mse) / denom;
  const interceptVar = (sumWXX * mse) / denom;

  return {
    slope: Math.sqrt(Math.max(0, slopeVar)),
    intercept: Math.sqrt(Math.max(0, interceptVar)),
  };
}

/**
 * Huber weight function for robust regression.
 * Downweights residuals larger than delta.
 */
function huberWeight(residual: number, delta: number): number {
  const absR = Math.abs(residual);
  if (absR <= delta) return 1;
  return delta / absR;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Fit a load-velocity profile using advanced weighted least squares.
 *
 * Supports:
 * - Recency weighting: newer data points weighted more via exponential decay
 * - Quality weighting: parallel quality scores (0-1) for each point
 * - Robust regression: Huber loss via IRLS (iteratively reweighted LS)
 * - Age filtering: exclude data points older than maxAge
 * - Uncertainty: standard errors for slope and intercept
 *
 * @param dataPoints - Observed load-velocity pairs
 * @param options - Fitting configuration
 * @returns Fitting result with regression parameters and uncertainty
 */
export function fitLVProfile(
  dataPoints: LoadVelocityDataPoint[],
  options?: FittingOptions
): FittingResult {
  if (dataPoints.length === 0) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      uncertainty: { slope: Infinity, intercept: Infinity },
      dataPointsUsed: 0,
    };
  }

  // Filter by max age
  let filtered = dataPoints;
  if (options?.maxAge !== undefined) {
    const now = Date.now();
    filtered = dataPoints.filter(
      (dp) => dp.timestamp === undefined || now - dp.timestamp <= options.maxAge!
    );
  }

  if (filtered.length === 0) {
    return {
      slope: 0,
      intercept: 0,
      rSquared: 0,
      uncertainty: { slope: Infinity, intercept: Infinity },
      dataPointsUsed: 0,
    };
  }

  const xs = filtered.map((dp) => dp.load);
  const ys = filtered.map((dp) => dp.velocity);

  // Build initial weights
  const weights = new Array(filtered.length).fill(1);

  // Apply recency weighting
  if (options?.weightByRecency) {
    const halfLife = options.recencyHalfLife ?? 30 * 24 * 60 * 60 * 1000; // 30 days
    const lambda = Math.LN2 / halfLife;
    const now = Date.now();

    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].timestamp !== undefined) {
        const age = now - filtered[i].timestamp!;
        weights[i] *= Math.exp(-lambda * age);
      }
    }
  }

  // Apply quality weighting
  if (options?.weightByQuality && options.qualityWeights) {
    // Map quality weights back to filtered indices
    for (let i = 0; i < filtered.length; i++) {
      const origIndex = dataPoints.indexOf(filtered[i]);
      if (origIndex >= 0 && origIndex < options.qualityWeights.length) {
        weights[i] *= options.qualityWeights[origIndex];
      }
    }
  }

  // Ensure no zero weights
  for (let i = 0; i < weights.length; i++) {
    weights[i] = Math.max(1e-10, weights[i]);
  }

  // Initial WLS fit
  let { slope, intercept } = weightedLeastSquares(xs, ys, weights);

  // Robust regression via IRLS (iteratively reweighted least squares)
  if (options?.robustRegression && filtered.length >= 3) {
    const maxIter = 20;
    const tolerance = 1e-6;

    for (let iter = 0; iter < maxIter; iter++) {
      // Compute residuals
      const residuals: number[] = [];
      for (let i = 0; i < filtered.length; i++) {
        residuals.push(ys[i] - (slope * xs[i] + intercept));
      }

      // Scale delta by MAD (median absolute deviation) of residuals
      // This is the standard approach for Huber regression
      const absResiduals = residuals.map(Math.abs).sort((a, b) => a - b);
      const mad = absResiduals[Math.floor(absResiduals.length / 2)] || 1;
      const scale = mad / 0.6745; // MAD to sigma conversion
      const delta = (options?.huberDelta ?? 1.345) * Math.max(scale, 1e-6);

      // Update weights using Huber function
      const robustWeights = [...weights];
      for (let i = 0; i < filtered.length; i++) {
        robustWeights[i] = weights[i] * huberWeight(residuals[i], delta);
      }

      // Re-fit with updated weights
      const newFit = weightedLeastSquares(xs, ys, robustWeights);

      // Check convergence
      const slopeDiff = Math.abs(newFit.slope - slope);
      const intDiff = Math.abs(newFit.intercept - intercept);
      slope = newFit.slope;
      intercept = newFit.intercept;

      if (slopeDiff < tolerance && intDiff < tolerance) break;
    }
  }

  const rSquared = computeWeightedRSquared(xs, ys, weights, slope, intercept);
  const uncertainty = computeUncertainty(xs, ys, weights, slope, intercept);

  return {
    slope,
    intercept,
    rSquared,
    uncertainty,
    dataPointsUsed: filtered.length,
  };
}
