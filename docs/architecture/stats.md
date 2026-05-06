# Stats primitives

Source: `src/stats/`. Two abstractions: `StreamingDistribution` (incremental statistics) and the `Scheme` family (configurable classification thresholds). Used pervasively by `src/analytics/fatigue.ts` and `src/analytics/types.ts`, plus the VBT RIR map.

## Table of contents

- [`StreamingDistribution`](#streamingdistribution)
- [Distribution functions](#distribution-functions)
- [`BreakpointScheme<T>`](#breakpointschemet)
- [`InterpolationScheme`](#interpolationscheme)
- [Default schemes](#default-schemes)

## `StreamingDistribution`

Definition: `src/stats/distribution.ts:12-23`. Immutable. Uses Welford's online algorithm for numerically stable variance.

```ts
interface StreamingDistribution {
  readonly n: number;
  readonly sum: number;
  readonly m2: number;          // Welford's sum of squared deviations from mean
  readonly min: number;
  readonly max: number;
}
```

`EMPTY_DISTRIBUTION` (`:29-35`) is `Object.freeze`'d with `n=0, sum=0, m2=0, min=Infinity, max=-Infinity`.

### Why both `sum` and `m2`?

- `sum` enables easy mean and trivial merging.
- `m2` enables numerically stable variance via Welford (avoids the catastrophic cancellation of the naive `E[X²] - E[X]²` form).

## Distribution functions

Source: `src/stats/distribution.ts`. All immutable — mutators return new objects.

| Function | Source line | Notes |
| --- | --- | --- |
| `createDistribution()` | `:40-42` | Returns `EMPTY_DISTRIBUTION`. |
| `addSample(dist, value)` | `:48-64` | Welford update: `oldMean → newMean → m2 += (v - oldMean)(v - newMean)`. |
| `mergeDist(a, b)` | `:70-93` | Parallel variance algorithm (Chan et al.) for combining two independent distributions: `m2 = a.m2 + b.m2 + δ² × a.n × b.n / n`. |
| `getMean(dist)` | `:99-102` | `0` for empty. |
| `getVariance(dist)` | `:108-111` | Sample variance with Bessel's correction (`m2 / (n-1)`). `0` for n < 2. |
| `getStdDev(dist)` | `:117-119` | `Math.sqrt(getVariance)`. |
| `getZScore(dist, value)` | `:125-129` | Returns `0` if stdDev is `0` (n < 2 or all same values). |
| `getCV(dist)` | `:135-139` | Coefficient of variation = `stdDev / |mean|`. `0` if mean is `0`. |
| `isOutlier(dist, value, zThreshold = 2.0)` | `:145-151` | |
| `isWithinRange(dist, value, sigmas = 2.0)` | `:157-163` | |
| `buildDistribution(values)` | `:169-171` | Convenience — folds an array via `addSample`. |

Re-exported from `src/index.ts:67-81`.

## `BreakpointScheme<T>`

Definition: `src/stats/schemes.ts:29-32`. Maps numeric values to a category `T` via ordered breakpoints.

```ts
interface BreakpointScheme<T> {
  readonly breakpoints: ReadonlyArray<{ below: number; value: T }>;
  readonly fallback: T;
}
```

`classifyByBreakpoints(value, scheme)` (`:62-69`) returns the value of the first breakpoint where `value < below`, or `fallback` if none match.

`createBreakpointScheme(breakpoints, fallback)` (`:120-128`) sorts breakpoints by `below` ascending — pass them in any order.

## `InterpolationScheme`

Definition: `src/stats/schemes.ts:49-51`. Linear interpolation between defined points, clamped at edges.

```ts
interface InterpolationScheme {
  readonly points: ReadonlyArray<{ input: number; output: number }>;
}
```

`interpolate(value, scheme)` (`:77-111`):
- Throws if `points` is empty.
- Returns `points[0].output` if length is 1.
- Clamps below first input / above last input.
- Linear interpolation between bracketing points otherwise.

`createInterpolationScheme(points)` (`:134-139`) sorts by `input` ascending.

## Default schemes

Source: `src/stats/schemes.ts:158-224`. All re-exported from `src/index.ts:84-96`.

### `DEFAULT_RIR_SCHEME` (`:158-168`)

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

Same values appear in `DEFAULT_VELOCITY_RIR_MAP` (`src/vbt/constants.ts:61-69`). Used by `estimateSetRIR` (`src/analytics/fatigue.ts:424-447`).

### `DEFAULT_CONSISTENCY_SCHEME` (`:177-183`)

`BreakpointScheme<'stable' | 'variable' | 'erratic'>` — classifies coefficient of variation:

| CV | Classification |
| --- | --- |
| < 0.10 | `stable` |
| < 0.20 | `variable` |
| ≥ 0.20 | `erratic` |

Used by `getSetConsistencyScore` (`src/analytics/fatigue.ts:331-352`).

### `DEFAULT_OUTLIER_SCHEME` (`:191-194`)

`BreakpointScheme<boolean>` — classifies absolute z-score:

| `|z|` | Outlier? |
| --- | --- |
| < 2.0 | `false` |
| ≥ 2.0 | `true` |

Used by `compareToExpectation` (`src/analytics/types.ts:121-151`), `findOutlierReps` (`src/analytics/fatigue.ts:361-415`), `getRepQualityFlags` (`src/analytics/quality.ts:120-150`).

### `DEFAULT_QUALITY_SCHEME` (`:203-209`)

`BreakpointScheme<'good' | 'warning' | 'poor'>` — classifies actual/expected ratio:

| Ratio | Quality |
| --- | --- |
| < 0.80 | `poor` |
| < 0.95 | `warning` |
| ≥ 0.95 | `good` |

Used by `getRepQualityFlags`.

### `DEFAULT_CONFIDENCE_SCHEME` (`:218-224`)

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
