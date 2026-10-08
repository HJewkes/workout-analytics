# VBT (velocity-based training) surface

Source: `src/vbt/`. Re-exported via `src/index.ts`.

## Table of contents

- [Constants and reference data](#constants-and-reference-data)
- [Load-velocity profile](#load-velocity-profile)
- [Velocity baseline](#velocity-baseline)
- [e1RM estimation](#e1rm-estimation)
- [Coverage tracking](#coverage-tracking)
- [Advanced profile fitting](#advanced-profile-fitting)
- [Research citations in source](#research-citations-in-source)

## Constants and reference data

Source: `src/vbt/constants.ts`.

### `VELOCITY_AT_PERCENT_1RM`

Mean concentric velocity at percentage of 1RM (Gonzalez-Badillo et al.). Defined in `src/vbt/constants.ts` as a record `Record<number, number>`. 13 entries from 30% (1.28 m/s) to 100% (0.17 m/s). Population averages — individual variation exists; cable values trend slightly lower due to constant tension.

### `DEFAULT_MVT`

`0.17 m/s` in `src/vbt/constants.ts`. Minimum velocity threshold — the velocity at which a true 1RM rep is performed. RepOne research notes individual MVT varies; this is a conservative default.

### `DEFAULT_VELOCITY_RIR_MAP`

`InterpolationScheme` mapping velocity-loss-% to RIR in `src/vbt/constants.ts`. Cable-machine-conservative (Rodiles-Guerrero 2020). Points: `0%→6, 10%→5, 20%→4, 30%→3, 40%→2, 50%→1, 60%→0`.

### Functions

| Function | Description |
| --- | --- |
| `estimatePercent1RMFromVelocity(velocity)` | Linear interpolation in `VELOCITY_AT_PERCENT_1RM`. Clamps to `[30, 100]`. |
| `categorizeVelocity(velocity, zones?)` | Returns the **5-way** `VelocityZoneId` from **mean** concentric velocity (m/s). Bands default to the profile-derived / movement-class table (`getVelocityZones`), not a hardcoded scale. |

### `VelocityZoneId` (canonical, 5-way)

`'grinding' \| 'maximalStrength' \| 'strengthSpeed' \| 'power' \| 'speed'` (`VelocityZoneId` in `src/vbt/zones.ts`). Bands are MEAN-concentric-velocity (WA-D02), profile-derived where an LV profile exists, else a movement-class default table — WA owns the boundaries; colors stay in the UI. Feed mean per-rep velocity (`getSetRepMeanVelocities`), never peak.

### `VelocityZone` (deprecated, 4-way)

`'fast' \| 'moderate' \| 'slow' \| 'grinding'` (`VelocityZone` in `src/vbt/zones.ts`) — superseded by the 5-way `VelocityZoneId`; retained only for backward compatibility.

## Load-velocity profile

Source: `src/vbt/profile.ts`. Linear regression `velocity = slope × load + intercept`. Linear (not polynomial) is recommended per PLoS ONE 2019; machine-based exercises show R² > 0.93 for individual profiles.

### Types

```ts
interface LoadVelocityDataPoint {
  readonly load: number;        // arbitrary units (kg/lbs/stack)
  readonly velocity: number;    // m/s mean concentric
  readonly timestamp?: number;  // optional, for recency weighting
}

interface LoadVelocityProfile {
  readonly dataPoints: readonly LoadVelocityDataPoint[];
  readonly slope: number;       // negative — velocity decreases with load
  readonly intercept: number;
  readonly rSquared: number;
  readonly estimated1RM: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly mvt: number;
}
```

(`LoadVelocityDataPoint` and `LoadVelocityProfile` in `src/vbt/profile.ts`.)

### Functions

| Function | Notes |
| --- | --- |
| `buildProfile(dataPoints, mvt = DEFAULT_MVT)` | OLS regression. Solves for `e1RM = (mvt − intercept) / slope`. A slope that is not negative, or an e1RM above 5× the heaviest load, is unusable: `low` confidence and `estimated1RM` 0. |
| `predictVelocity(profile, load)` | Clamped to ≥0. |
| `estimateLoad(profile, targetVelocity)` | Returns 0 if slope is 0. |
| `addDataPoint(profile, point)` | Returns a new profile with the additional point. Re-runs OLS. |

### Confidence rubric (`buildProfile`)

| Confidence | Criteria |
| --- | --- |
| `high` | R² ≥ 0.90 AND ≥ 3 data points |
| `medium` | R² ≥ 0.70 AND ≥ 2 data points |
| `low` | otherwise, and always when the profile is unusable: the slope is zero, positive or NaN (flat or inverted), or the extrapolated e1RM exceeds 5× the heaviest load seen (`MAX_E1RM_TO_MAX_LOAD_RATIO`, a near-zero negative slope). `estimated1RM` is then 0 |

OLS internals in `src/vbt/profile.ts` (private `olsRegression`, including degenerate-case handling for empty / single-point / zero-variance inputs).

## Velocity baseline

Source: `src/vbt/baseline.ts`. Used for readiness assessment — comparing today's first-rep velocity against historical observations at the same load.

The velocity throughout is first-rep mean concentric velocity, the value `getSetFirstRepVelocity` returns. Build the baseline from that value and pass the same value for today's set to `computeReadiness`. A baseline fed peak velocity sits about 1.4× above the mean, so every day would read red.

### Type

```ts
interface VelocityBaseline {
  readonly dataPoints: readonly LoadVelocityDataPoint[];  // sorted by load
}
```

### Functions

| Function | Notes |
| --- | --- |
| `buildBaseline(dataPoints, key?)` | Sorts by load ascending. Preserves duplicates at same load. |
| `getExpectedVelocity(baseline, load)` | Linear interpolation between bracketing points. Returns `null` when load is outside the observed range or baseline is empty. With one point, returns its velocity only on exact match. |
| `updateBaselineWithPoint(baseline, load, meanVelocity, opts?)` | Returns a new baseline with one point added. `meanVelocity` is first-rep mean concentric velocity (`getSetFirstRepVelocity`). `opts.timestamp` stamps the point (defaults to `Date.now()`); `opts.maxPoints` evicts the oldest point when exceeded. |

## e1RM estimation

Source: `src/vbt/e1rm.ts`. Three methods: profile-based, rep-based (Epley), and confidence-weighted hybrid.

### Type

```ts
interface E1RMEstimate {
  readonly e1RM: number;
  readonly confidence: number;          // 0-1
  readonly method: 'profile' | 'reps' | 'hybrid';
}
```

### Functions

| Function | Confidence formula |
| --- | --- |
| `estimateE1RMFromProfile(profile, mvt = 0.17)` | `R² × min(1, n / 5)` — needs both fit quality and data volume. Returns e1RM 0 and confidence 0 when the slope is not negative or the e1RM exceeds 5× the heaviest load in the profile. |
| `estimateE1RMFromReps(load, reps)` | Epley: `load × (1 + reps / 30)`. Confidence: 0.5 (1 rep; singles are mostly sub-max warm-up and profiling reps, not max attempts), 0.9 (≤5), 0.85 (≤8), 0.7 (≤12), decays beyond 12. |
| `estimateHybridE1RM(velocityEstimate, repsEstimate)` | Confidence-weighted average of e1RMs. Confidence `(1 − (1 − vc)(1 − rc)) × (1 − disagreement × weaker / stronger)`: two agreeing estimates are at least as confident as the stronger input, a zero-confidence input leaves the other's confidence unchanged, and two equally confident estimates far apart are less confident than either. |

### Method selection (in `computeStrengthEstimate`, `src/analytics/session.ts`)

1. Find the best rep-based estimate across all sets. Only sets whose Epley e1RM is at least 0.85 of the session's highest are eligible (`MIN_E1RM_SHARE_OF_SESSION_MAX`), so the pick never falls more than 15% below the raw maximum and a warm-up, back-off set or sub-max single cannot set it. Among those, the set with the highest e1RM × confidence wins, ties to the higher e1RM. A 3-rep set at 90 (99 × 0.9) beats a 20-rep set at 60 (100 × 0.3); a single at 95 after a 10-rep set at 90 (98.2 < 0.85 × 120) does not.
2. If a profile is provided AND has ≥2 data points: compute profile-based estimate; if rep-based also exists, return hybrid; else profile-only.
3. Else return rep-based.

## Coverage tracking

Source: `src/vbt/coverage.ts`. Bins observations by `%e1RM` to identify under-sampled intensity ranges.

### Types

```ts
interface CoverageBin {
  readonly range: readonly [number, number];  // [low, high) in %e1RM
  readonly count: number;
  readonly lastObservedAt: number | null;
}

interface CoverageResult {
  readonly bins: readonly CoverageBin[];
  readonly gaps: readonly CoverageBin[];      // bins with count === 0
  readonly coverageScore: number;             // 0-1 fraction of bins observed
}
```

### Functions

| Function | Notes |
| --- | --- |
| `computeCoverage(dataPoints, e1RM, options?)` | `options.binWidth` (default 10; throws `RangeError` unless finite and positive), `options.binRange` (default `[40, 100]`; throws `RangeError` for a NaN or ±Infinity bound, a max at or below its min, or a span too large to count in bins of `binWidth`), `options.stalenessMs` (filter old points). Bins are built by index (`low = rangeMin + i * binWidth`) from a bin count computed once (private `countBins` / `createBins`), so a fractional width adds no sliver top bin; the last bin may be narrower and ends at `rangeMax`. Returns empty score (0) if `e1RM <= 0`. A point at exactly the top of `binRange` counts in the top bin, like `buildCoverageMap`. |
| `identifyCoverageGaps(coverage, minObservations = 1)` | Bins below the threshold count. |

Used to direct exploration sets — schedule the athlete at intensities that are under-represented in their training history.

## Advanced profile fitting

Source: `src/vbt/profile-fitting.ts`. Enhanced regression for `fitLVProfile` — recency weighting, quality weighting, robust regression, uncertainty.

### `FittingOptions`

```ts
interface FittingOptions {
  weightByRecency?: boolean;          // exponential decay by timestamp
  weightByQuality?: boolean;          // requires qualityWeights
  robustRegression?: boolean;         // Huber loss via IRLS
  maxAge?: number;                    // ms — exclude older points
  recencyHalfLife?: number;           // ms — default 30 days
  qualityWeights?: readonly number[];  // 0-1, parallel to dataPoints
  huberDelta?: number;                // default 1.345 (95% efficiency)
}
```

(`src/vbt/profile-fitting.ts`.)

### `FittingResult`

```ts
interface FittingResult {
  readonly slope: number;
  readonly intercept: number;
  readonly rSquared: number;
  readonly uncertainty: { readonly slope: number; readonly intercept: number };
  readonly dataPointsUsed: number;
}
```

(`src/vbt/profile-fitting.ts`.)

### Internals

| Helper | Notes |
| --- | --- |
| `weightedLeastSquares(xs, ys, weights)` | |
| `computeWeightedRSquared(xs, ys, weights, slope, intercept)` | |
| `computeUncertainty(xs, ys, weights, slope, intercept)` | needs n ≥ 3, MSE-scaled standard errors. |
| `huberWeight(residual, delta)` | `1` if `|r| ≤ δ`, else `δ / |r|`. |

### `fitLVProfile`

`fitLVProfile(dataPoints, options?)` in `src/vbt/profile-fitting.ts`.

Pipeline:
1. Empty check.
2. Filter by `maxAge`.
3. Initialize per-point weights to 1.
4. Apply recency weighting (`exp(-λ × age)` with `λ = ln(2) / halfLife`).
5. Apply quality weighting.
6. Initial WLS fit.
7. If `robustRegression && filtered.length >= 3`: IRLS loop (max 20 iter, tol 1e-6). Per iteration: compute residuals → MAD-scale δ → Huber-weight → re-fit. The `1.345` default delta is the standard 95%-efficiency setting for Gaussian residuals.
8. Compute weighted R² and uncertainty.

This is independent of the basic `buildProfile` — `FittingResult` does NOT contain a `confidence` label or an `estimated1RM`. Callers wanting both can derive 1RM from `(mvt − intercept) / slope` and label confidence themselves.

## Research citations in source

Quick index of literature references that appear inline in VBT source:

| Source | Reference |
| --- | --- |
| `src/vbt/constants.ts` `VELOCITY_AT_PERCENT_1RM` | Gonzalez-Badillo et al. — `VELOCITY_AT_PERCENT_1RM` table. |
| `src/vbt/constants.ts` `DEFAULT_MVT` | RepOne — individual MVT variability. |
| `src/vbt/constants.ts` `DEFAULT_VELOCITY_RIR_MAP` | Rodiles-Guerrero 2020 — cable-machine velocity-loss-to-fatigue mapping. |
| `src/vbt/profile.ts` module header | PLoS ONE 2019 — linear over polynomial; machine R² > 0.93. |
| `src/analytics/intensity.ts` module header | Robinson et al. 2024, Refalo 2024, Martikainen 2025 — hardness decay rate. |
| `src/analytics/intensity.ts` `getRepHardnessWeight` docstring | Robinson 2024 meta-regression — gradual dose-response near failure. |
| `src/analytics/intensity.ts` `estimatePerRepRIR` docstring | J Strength Cond Res 2020 — velocity-loss vs reps-completed R²=0.93-0.97. |
