# Stats primitives

Source: `src/stats/`. Two abstractions: `StreamingDistribution` (incremental statistics) and the `Scheme` family (configurable classification thresholds). Used pervasively by `src/analytics/fatigue.ts` and `src/analytics/types.ts`, plus the VBT RIR map.

## Table of contents

- [`StreamingDistribution`](#streamingdistribution)
- [Distribution functions](#distribution-functions)
- [`BreakpointScheme<T>`](#breakpointschemet)
- [`InterpolationScheme`](#interpolationscheme)
- [Default schemes](#default-schemes)

## `StreamingDistribution`

Definition: `src/stats/distribution.ts`. Immutable. Uses Welford's online algorithm for numerically stable variance.

```ts
interface StreamingDistribution {
  readonly n: number;
  readonly sum: number;
  readonly m2: number;          // Welford's sum of squared deviations from mean
  readonly min: number;
  readonly max: number;
}
```

`EMPTY_DISTRIBUTION` is `Object.freeze`'d with `n=0, sum=0, m2=0, min=Infinity, max=-Infinity`.

### Why both `sum` and `m2`?

- `sum` enables easy mean and trivial merging.
- `m2` enables numerically stable variance via Welford (avoids the catastrophic cancellation of the naive `E[X²] - E[X]²` form).

## Distribution functions

Source: `src/stats/distribution.ts`. All immutable — mutators return new objects.

| Function | Notes |
| --- | --- |
| `createDistribution()` | Returns `EMPTY_DISTRIBUTION`. |
| `addSample(dist, value)` | Welford update: `oldMean → newMean → m2 += (v - oldMean)(v - newMean)`. |
| `mergeDist(a, b)` | Parallel variance algorithm (Chan et al.) for combining two independent distributions: `m2 = a.m2 + b.m2 + δ² × a.n × b.n / n`. |
| `getMean(dist)` | `0` for empty. |
| `getVariance(dist)` | Sample variance with Bessel's correction (`m2 / (n-1)`). `0` for n < 2. |
| `getStdDev(dist)` | `Math.sqrt(getVariance)`. |
| `getZScore(dist, value)` | Returns `0` if stdDev is `0` (n < 2 or all same values). |
| `getCV(dist)` | Coefficient of variation = `stdDev / |mean|`. `0` if mean is `0`. |
| `isOutlier(dist, value, zThreshold = 2.0)` | |
| `isWithinRange(dist, value, sigmas = 2.0)` | |
| `buildDistribution(values)` | Convenience — folds an array via `addSample`. |

Re-exported from `src/index.ts`.

## `BreakpointScheme<T>`

Definition: `src/stats/schemes.ts`. Maps numeric values to a category `T` via ordered breakpoints.

```ts
interface BreakpointScheme<T> {
  readonly breakpoints: ReadonlyArray<{ below: number; value: T }>;
  readonly fallback: T;
}
```

`classifyByBreakpoints(value, scheme)` returns the value of the first breakpoint where `value < below`, or `fallback` if none match.

`createBreakpointScheme(breakpoints, fallback)` sorts breakpoints by `below` ascending — pass them in any order.

## `InterpolationScheme`

Definition: `src/stats/schemes.ts`. Linear interpolation between defined points, clamped at edges.

```ts
interface InterpolationScheme {
  readonly points: ReadonlyArray<{ input: number; output: number }>;
}
```

`interpolate(value, scheme)`:
- Throws if `points` is empty.
- Returns `points[0].output` if length is 1.
- Clamps below first input / above last input.
- Linear interpolation between bracketing points otherwise.

`createInterpolationScheme(points)` sorts by `input` ascending.

## Default schemes

Source: `src/stats/schemes.ts`. All re-exported from `src/index.ts`.

### `DEFAULT_RIR_SCHEME`

`InterpolationScheme` mapping velocity-loss-% to RIR:

| Velocity loss % | RIR |
| --- | --- |
| 0 | 6 |
| 10 | 5 |
| 20 | 4 |
| 30 | 3 |
| 40 | 2 |
| 50 | 1 |
| 60+ | 0 |

Same values appear in `DEFAULT_VELOCITY_RIR_MAP` (`src/vbt/constants.ts`). Used by `estimateSetRIR` (`src/analytics/fatigue.ts`).

### `DEFAULT_CONSISTENCY_SCHEME`

`BreakpointScheme<'stable' | 'variable' | 'erratic'>` — classifies coefficient of variation:

| CV | Classification |
| --- | --- |
| < 0.10 | `stable` |
| < 0.20 | `variable` |
| ≥ 0.20 | `erratic` |

Used by `getSetConsistencyScore` (`src/analytics/fatigue.ts`).

### `DEFAULT_OUTLIER_SCHEME`

`BreakpointScheme<boolean>` — classifies absolute z-score:

| `|z|` | Outlier? |
| --- | --- |
| < 2.0 | `false` |
| ≥ 2.0 | `true` |

Used by `compareToExpectation` (`src/analytics/types.ts`) and `getRepQualityFlags` (`src/analytics/quality.ts`). Both score against an EXTERNAL baseline distribution, where a fixed cut is fine.

**Not** used by `findOutlierReps`, whose z-scores are within-set: Samuelson's inequality bounds those at `(n-1)/√n`, so 2.0 is unreachable for n ≤ 5. That function uses Grubbs' critical value instead — see below.

### `grubbsCriticalValue(n, alpha)` (`src/stats/grubbs.ts`)

Two-sided Grubbs critical value for a single outlier, per NIST/SEMATECH e-Handbook §1.3.5.17:

    G_crit = ((n - 1) / √n) * √(t² / (n - 2 + t²))

with `t` the upper t critical value at `alpha / (2n)` on `n - 2` degrees of freedom. `alpha` defaults to `GRUBBS_DEFAULT_ALPHA = 0.05`, the level the published table uses. `studentTTwoSidedTail(t, nu)` supplies the t distribution in closed form for integer `nu` (Abramowitz & Stegun 26.7.3 / 26.7.4), so no dependency is needed. `maxAbsZScore(n)` returns the Samuelson bound `(n - 1) / √n`.

`isGrubbsOutlier(absZScore, n, alpha)` is the **sole home** of the `G > G_crit` comparison. The boundary is **exclusive**: a value exactly equal to the critical value is not an outlier. Keep the comparison there rather than inlining it — the critical value comes out of a bisection, so no set of reps produces a z-score equal to it in floating point, and passing the critical value to this function is the only way the boundary can be tested at all.

| n | `maxAbsZScore` | `grubbsCriticalValue(n, 0.05)` |
| --- | --- | --- |
| 3 | 1.1547 | 1.1543 |
| 4 | 1.5000 | 1.4812 |
| 5 | 1.7889 | 1.7150 |
| 6 | 2.0412 | 1.8871 |
| 10 | 2.8460 | 2.2900 |
| 20 | 4.2485 | 2.7082 |

### `DEFAULT_QUALITY_SCHEME`

`BreakpointScheme<'good' | 'warning' | 'poor'>` — classifies actual/expected ratio:

| Ratio | Quality |
| --- | --- |
| < 0.80 | `poor` |
| < 0.95 | `warning` |
| ≥ 0.95 | `good` |

Used by `getRepQualityFlags`.

### `DEFAULT_CONFIDENCE_SCHEME`

`BreakpointScheme<'high' | 'medium' | 'low'>` — classifies sample count:

| n | Confidence |
| --- | --- |
| < 5 | `low` |
| < 20 | `medium` |
| ≥ 20 | `high` |

Used by `compareToExpectation` to attach a confidence label to comparisons against distribution-based expectations.

## Where these are used

| Module | Schemes referenced |
| --- | --- |
| `src/analytics/types.ts` (`compareToExpectation`) | `DEFAULT_OUTLIER_SCHEME`, `DEFAULT_CONFIDENCE_SCHEME` |
| `src/analytics/fatigue.ts` | `DEFAULT_RIR_SCHEME`, `DEFAULT_CONSISTENCY_SCHEME`, `DEFAULT_OUTLIER_SCHEME` |
| `src/analytics/quality.ts` | `DEFAULT_OUTLIER_SCHEME`, `DEFAULT_QUALITY_SCHEME`, `DEFAULT_PARTIAL_REP_SCHEME`, `DEFAULT_ECC_RUSHED_SCHEME` |
| `src/vbt/constants.ts` | `DEFAULT_VELOCITY_RIR_MAP` (its own `InterpolationScheme`, separate from `DEFAULT_RIR_SCHEME` but identical points) |

Every analytics function that classifies takes an optional `schemes` parameter and falls back to the defaults — so consumers can override per-user, per-exercise, or per-population without forking the library.
