/**
 * Bayesian LV Profile Fitting - Conjugate Gaussian linear regression.
 *
 * Alternative to the WLS implementation in profile-fitting.ts. Returns a full
 * posterior distribution over (a, b) in `v = a + b*load`, enabling downstream
 * code to compute confidence intervals on e1RM and make exploration vs.
 * exploitation decisions per VBT autoregulation spec §5.1.
 *
 * Math: normal-normal conjugate Bayesian linear regression. The prior is a
 * diagonal Gaussian (a, b independent). The likelihood is Gaussian with fixed
 * noise variance sigma2 (homoscedastic). The posterior is also Gaussian with
 * closed-form mean and covariance computed via the precision (inverse-covariance)
 * form — no matrix library needed for this 2×2 case.
 */

import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Types
// =============================================================================

export interface BayesianLVPrior {
  /** Prior mean for a (intercept = velocity at zero load). Default 1.5 m/s. */
  meanA?: number;
  /** Prior mean for b (slope = velocity decline per kg). Default -0.005. */
  meanB?: number;
  /** Prior variance on a. Default 1.0 (weakly informative). */
  varA?: number;
  /** Prior variance on b. Default 0.001. */
  varB?: number;
  /**
   * Observation noise variance (assumed homoscedastic).
   * Default 0.01 (≈ 0.1 m/s std). Treat as a hyperparameter: lower values
   * mean more trust in individual velocity readings.
   */
  sigma2?: number;
}

export interface BayesianLVPosterior {
  /** Posterior mean of intercept (velocity extrapolated to zero load). */
  a: number;
  /** Posterior mean of slope (velocity change per unit load). */
  b: number;
  /** Posterior variance of a. */
  varA: number;
  /** Posterior variance of b. */
  varB: number;
  /**
   * Posterior correlation between a and b. Typically negative: a high
   * intercept combined with a gentle slope, or vice versa, still hits the
   * observed data.
   */
  corr: number;
  /** R² of the posterior-mean line on the data (sanity-check fit quality). */
  rSquared: number;
  /** Number of data points used. */
  n: number;
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Resolved prior with all fields present. */
interface ResolvedPrior {
  meanA: number;
  meanB: number;
  varA: number;
  varB: number;
  sigma2: number;
}

function resolvePrior(prior?: BayesianLVPrior): ResolvedPrior {
  return {
    meanA: prior?.meanA ?? 1.5,
    meanB: prior?.meanB ?? -0.005,
    varA: prior?.varA ?? 1.0,
    varB: prior?.varB ?? 0.001,
    sigma2: prior?.sigma2 ?? 0.01,
  };
}

/**
 * Invert a 2×2 symmetric positive-definite matrix [[a,b],[b,d]].
 * Returns [[a,b],[b,d]]^-1. Throws if the matrix is singular (det ≈ 0).
 */
function invert2x2(
  a: number,
  b: number,
  d: number
): { a: number; b: number; d: number } {
  const det = a * d - b * b;
  if (Math.abs(det) < 1e-15) {
    // Degenerate: return near-zero precision → near-infinite variance (prior dominates).
    const huge = 1e15;
    return { a: huge, b: 0, d: huge };
  }
  return { a: d / det, b: -b / det, d: a / det };
}

/**
 * Compute unweighted R² for the line `velocity = a + b*load` against data.
 */
function computeRSquared(
  data: LoadVelocityDataPoint[],
  a: number,
  b: number
): number {
  const n = data.length;
  if (n < 2) return 0;

  let sumV = 0;
  for (const pt of data) sumV += pt.velocity;
  const meanV = sumV / n;

  let ssTot = 0;
  let ssRes = 0;
  for (const pt of data) {
    const predicted = a + b * pt.load;
    ssTot += (pt.velocity - meanV) ** 2;
    ssRes += (pt.velocity - predicted) ** 2;
  }

  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Fit a load-velocity profile using conjugate Bayesian linear regression.
 *
 * Model: v_i = a + b * load_i + ε_i,  ε_i ~ N(0, sigma2)
 * Prior: a ~ N(meanA, varA),  b ~ N(meanB, varB),  independent
 * Posterior: closed-form Gaussian over (a, b) via precision update:
 *
 *   Λ_prior = diag(1/varA, 1/varB)
 *   Λ_data  = X'X / sigma2        where X = [[1, load_i], ...]
 *   Λ_post  = Λ_prior + Λ_data
 *
 *   η_prior = Λ_prior * [meanA, meanB]'
 *   η_data  = X'y / sigma2
 *   μ_post  = Λ_post^-1 * (η_prior + η_data)
 *
 * All matrix ops are inlined for the 2×2 case.
 *
 * @param data  - Observed load-velocity pairs (uses `load` and `velocity`).
 * @param prior - Prior hyperparameters. Defaults are weakly informative for
 *                typical barbell lifts (intercept ≈ 1.5 m/s, slope ≈ -0.005).
 * @returns Posterior mean + covariance + R² diagnostic.
 *
 * @remarks
 * **Degeneracy**: if all data points share the same load value, X'X is rank-1
 * (singular). The `invert2x2` guard returns near-infinite covariance in that
 * case so the posterior collapses to the prior on the degenerate axis rather
 * than producing NaN. The returned `corr` will be 0 in that case.
 */
export function fitLVProfileBayesian(
  data: LoadVelocityDataPoint[],
  prior?: BayesianLVPrior
): BayesianLVPosterior {
  const p = resolvePrior(prior);

  if (data.length === 0) {
    return {
      a: p.meanA,
      b: p.meanB,
      varA: p.varA,
      varB: p.varB,
      corr: 0,
      rSquared: 0,
      n: 0,
    };
  }

  // Accumulate X'X (2×2 symmetric) and X'y (2-vector).
  // X row i = [1, load_i], so:
  //   X'X = [[n,   sumL ],
  //          [sumL, sumLL]]
  //   X'y = [sumV, sumLV]

  let sumL = 0;
  let sumLL = 0;
  let sumV = 0;
  let sumLV = 0;
  const n = data.length;

  for (const pt of data) {
    sumL += pt.load;
    sumLL += pt.load * pt.load;
    sumV += pt.velocity;
    sumLV += pt.load * pt.velocity;
  }

  // Precision matrices (symmetric 2×2, stored as upper-triangular: [aa, ab, bb]).
  // Prior precision (diagonal):
  const priorPrecAA = 1 / p.varA;
  const priorPrecAB = 0;
  const priorPrecBB = 1 / p.varB;

  // Data precision:
  const dataPrecAA = n / p.sigma2;
  const dataPrecAB = sumL / p.sigma2;
  const dataPrecBB = sumLL / p.sigma2;

  // Posterior precision:
  const postPrecAA = priorPrecAA + dataPrecAA;
  const postPrecAB = priorPrecAB + dataPrecAB;
  const postPrecBB = priorPrecBB + dataPrecBB;

  // Posterior covariance = inverse of posterior precision.
  const cov = invert2x2(postPrecAA, postPrecAB, postPrecBB);
  const postVarA = cov.a;
  const postCovAB = cov.b;
  const postVarB = cov.d;

  // Natural parameter (precision × mean):
  // η_prior = [meanA/varA, meanB/varB]
  // η_data  = [sumV/sigma2, sumLV/sigma2]
  const etaA = p.meanA / p.varA + sumV / p.sigma2;
  const etaB = p.meanB / p.varB + sumLV / p.sigma2;

  // Posterior mean = cov * eta.
  const postA = cov.a * etaA + cov.b * etaB;
  const postB = cov.b * etaA + cov.d * etaB;

  // Correlation from covariance.
  const covDenomSq = postVarA * postVarB;
  const corr = covDenomSq > 0 ? postCovAB / Math.sqrt(covDenomSq) : 0;

  const rSquared = computeRSquared(data, postA, postB);

  return {
    a: postA,
    b: postB,
    varA: postVarA,
    varB: postVarB,
    corr: Math.max(-1, Math.min(1, corr)),
    rSquared,
    n,
  };
}
