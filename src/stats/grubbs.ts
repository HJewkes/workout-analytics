/**
 * Grubbs' test for a single outlier, and the Student's t tail it needs.
 *
 * A within-set z-score cannot be compared against a rep-count-independent
 * cut. Samuelson's inequality bounds |z| at `(n - 1) / sqrt(n)` when the
 * standard deviation carries Bessel's correction, which `getVariance` applies
 * (`src/stats/distribution.ts:108-111`). So a fixed cut of 2.0 is unreachable
 * for n <= 5 whatever the data — 1.1547 / 1.5000 / 1.7889 at n = 3 / 4 / 5,
 * the table verified in `KNOWN-ISSUES-2026-07-27.md:96-104`. Grubbs' critical
 * value scales with n and stays strictly inside that bound at every n >= 3.
 *
 * References:
 * - NIST/SEMATECH e-Handbook of Statistical Methods, §1.3.5.17 "Grubbs' Test
 *   for Outliers" — the test statistic and the critical-value formula below.
 * - Grubbs, F. E. (1969), "Procedures for Detecting Outlying Observations in
 *   Samples", Technometrics 11(1):1-21.
 * - Abramowitz & Stegun, "Handbook of Mathematical Functions", 26.7.3 and
 *   26.7.4 — the closed-form Student's t distribution for integer d.f.
 */

/**
 * Significance level for Grubbs' test.
 *
 * 0.05 is the level at which the two-sided Grubbs critical-value table is
 * published in NIST/SEMATECH §1.3.5.17; it is not a cut chosen here.
 * `grubbsCriticalValue` reproduces that table, which is what
 * `grubbs.test.ts` asserts.
 */
export const GRUBBS_DEFAULT_ALPHA = 0.05;

/**
 * Largest |z| any single element of an n-sample set can attain, per
 * Samuelson's inequality with Bessel's correction: `(n - 1) / sqrt(n)`.
 *
 * Returns 0 for n < 2, where the sample standard deviation is undefined.
 */
export function maxAbsZScore(n: number): number {
  if (n < 2) return 0;
  return (n - 1) / Math.sqrt(n);
}

/**
 * `P(|T| > t)` for Student's t with `nu` integer degrees of freedom.
 *
 * Exact closed form (Abramowitz & Stegun 26.7.3 for odd `nu`, 26.7.4 for
 * even `nu`), so no numerical integration and no dependency is needed.
 * Absolute accuracy is ~1e-15, which limits usable significance levels to
 * roughly 1e-8 and above.
 */
export function studentTTwoSidedTail(t: number, nu: number): number {
  if (nu < 1) return 1;
  if (!Number.isFinite(t)) return 0;
  const theta = Math.atan(Math.abs(t) / Math.sqrt(nu));
  const within = nu % 2 === 1 ? oddDfCdf(theta, nu) : evenDfCdf(theta, nu);
  return Math.min(1, Math.max(0, 1 - within));
}

/** `P(|T| <= t)` for odd `nu`, as `theta = atan(t / sqrt(nu))` (A&S 26.7.3). */
function oddDfCdf(theta: number, nu: number): number {
  const cos = Math.cos(theta);
  let term = cos;
  let sum = cos;
  for (let j = 2; j <= (nu - 1) / 2; j++) {
    term *= (cos * cos * (2 * j - 2)) / (2 * j - 1);
    sum += term;
  }
  const series = nu === 1 ? 0 : Math.sin(theta) * sum;
  return (2 / Math.PI) * (theta + series);
}

/** `P(|T| <= t)` for even `nu`, as `theta = atan(t / sqrt(nu))` (A&S 26.7.4). */
function evenDfCdf(theta: number, nu: number): number {
  const cos = Math.cos(theta);
  let term = 1;
  let sum = 1;
  for (let j = 1; j <= nu / 2 - 1; j++) {
    term *= (cos * cos * (2 * j - 1)) / (2 * j);
    sum += term;
  }
  return Math.sin(theta) * sum;
}

/** `t` with `P(T > t) = upperTail` on `nu` degrees of freedom, by bisection. */
function studentTUpperQuantile(upperTail: number, nu: number): number {
  const target = 2 * upperTail;
  let low = 0;
  let high = 1e6;
  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    if (studentTTwoSidedTail(mid, nu) > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Two-sided Grubbs critical value for `n` samples at significance `alpha`
 * (NIST/SEMATECH §1.3.5.17):
 *
 *     G_crit = ((n - 1) / sqrt(n)) * sqrt(t^2 / (n - 2 + t^2))
 *
 * where `t` is the upper t critical value at `alpha / (2n)` on `n - 2`
 * degrees of freedom. The `alpha / (2n)` term is the Bonferroni correction
 * for testing whichever of the n observations turned out to be the extreme
 * one. A sample is an outlier when its |z| exceeds this value.
 *
 * Returns `Infinity` for n < 3, where the test is not defined.
 */
export function grubbsCriticalValue(n: number, alpha: number = GRUBBS_DEFAULT_ALPHA): number {
  if (n < 3) return Infinity;
  const t = studentTUpperQuantile(alpha / (2 * n), n - 2);
  return maxAbsZScore(n) * Math.sqrt((t * t) / (n - 2 + t * t));
}

/**
 * Whether `absZScore` is a Grubbs outlier among `n` samples at `alpha`.
 *
 * The boundary is EXCLUSIVE: a value exactly equal to the critical value is
 * not an outlier, matching the test's `G > G_crit` rejection rule. This is
 * the sole home of that comparison, because the boundary cannot be reached
 * through constructed sample data — the critical value comes out of a
 * bisection, so no set of reps lands a z-score exactly on it in floating
 * point. Keeping the comparison here makes the boundary directly testable.
 */
export function isGrubbsOutlier(
  absZScore: number,
  n: number,
  alpha: number = GRUBBS_DEFAULT_ALPHA
): boolean {
  return absZScore > grubbsCriticalValue(n, alpha);
}
