# VBT (velocity-based training) surface

Source: `src/vbt/`. Re-exported via `src/index.ts:230-269`.

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

Mean concentric velocity at percentage of 1RM (Gonzalez-Badillo et al.). Defined at `src/vbt/constants.ts:28-42` as a record `Record<number, number>`. 13 entries from 30% (1.28 m/s) to 100% (0.17 m/s). Population averages — individual variation exists; cable values trend slightly lower due to constant tension.

### `DEFAULT_MVT`

`0.17 m/s` at `src/vbt/constants.ts:51`. Minimum velocity threshold — the velocity at which a true 1RM rep is performed. RepOne research notes individual MVT varies; this is a conservative default.

### `DEFAULT_VELOCITY_RIR_MAP`

`InterpolationScheme` mapping velocity-loss-% to RIR at `src/vbt/constants.ts:61-69`. Cable-machine-conservative (Rodiles-Guerrero 2020). Points: `0%→6, 10%→5, 20%→4, 30%→3, 40%→2, 50%→1, 60%→0`.

### Functions

| Function | Source line | Description |
| --- | --- | --- |
| `estimatePercent1RMFromVelocity(velocity)` | `constants.ts:89-113` | Linear interpolation in `VELOCITY_AT_PERCENT_1RM`. Clamps to `[30, 100]`. |
| `categorizeVelocity(velocity, zones?)` | `zones.ts:266-276` | Returns the **5-way** `VelocityZoneId` from **mean** concentric velocity (m/s). Bands default to the profile-derived / movement-class table (`getVelocityZones`), not a hardcoded scale. |

### `VelocityZoneId` (canonical, 5-way)

`'grinding' \| 'maximalStrength' \| 'strengthSpeed' \| 'power' \| 'speed'` (`src/vbt/zones.ts:27`). Bands are MEAN-concentric-velocity (WA-D02), profile-derived where an LV profile exists, else a movement-class default table — WA owns the boundaries; colors stay in the UI. Feed mean per-rep velocity (`getSetRepMeanVelocities`), never peak.

### `VelocityZone` (deprecated, 4-way)

`'fast' \| 'moderate' \| 'slow' \| 'grinding'` (`src/vbt/zones.ts:37`) — superseded by the 5-way `VelocityZoneId`; retained only for backward compatibility.

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

(`src/vbt/profile.ts:22-45`.)

### Functions

| Function | Source line | Notes |
| --- | --- | --- |
| `buildProfile(dataPoints, mvt = DEFAULT_MVT)` | `:131-170` | OLS regression. Solves for `e1RM = (mvt − intercept) / slope`. |
| `predictVelocity(profile, load)` | `:179-182` | Clamped to ≥0. |
| `estimateLoad(profile, targetVelocity)` | `:191-195` | Returns 0 if slope is 0. |
| `addDataPoint(profile, point)` | `:205-210` | Returns a new profile with the additional point. Re-runs OLS. |

### Confidence rubric (`buildProfile`, `:152-159`)

| Confidence | Criteria |
| --- | --- |
| `high` | R² ≥ 0.90 AND ≥ 3 data points |
| `medium` | R² ≥ 0.70 AND ≥ 2 data points |
| `low` | otherwise |

OLS internals at `src/vbt/profile.ts:61-111` (`olsRegression`, including degenerate-case handling for empty / single-point / zero-variance inputs).

## Velocity baseline

Source: `src/vbt/baseline.ts`. Used for readiness assessment — comparing today's first-rep velocity against historical observations at the same load.

### Type

```ts
interface VelocityBaseline {
  readonly dataPoints: readonly LoadVelocityDataPoint[];  // sorted by load
}
```

### Functions

| Function | Source line | Notes |
| --- | --- | --- |
| `buildBaseline(dataPoints)` | `:37-40` | Sorts by load ascending. Preserves duplicates at same load. |
| `getExpectedVelocity(baseline, load)` | `:53-88` | Linear interpolation between bracketing points. Returns `null` when load is outside the observed range or baseline is empty. With one point, returns its velocity only on exact match. |

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

| Function | Source line | Confidence formula |
| --- | --- | --- |
| `estimateE1RMFromProfile(profile, mvt = 0.17)` | `:47-67` | `R² × min(1, n / 5)` — needs both fit quality and data volume. |
| `estimateE1RMFromReps(load, reps)` | `:90-119` | Epley: `load × (1 + reps / 30)`. Confidence: 0.5 (1 rep), 0.9 (≤5), 0.85 (≤8), 0.7 (≤12), decays beyond 12. |
| `estimateHybridE1RM(velocityEstimate, repsEstimate)` | `:138-168` | Confidence-weighted average of e1RMs. Confidence boosted by agreement between methods (`0.8 + 0.2 × agreement` factor). |

### Method selection (in `computeStrengthEstimate`, `src/analytics/session.ts:78-126`)

1. Find best rep-based estimate across all sets (Epley over `(load, reps)` pairs).
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

| Function | Source line | Notes |
| --- | --- | --- |
| `computeCoverage(dataPoints, e1RM, options?)` | `:56-120` | `options.binWidth` (default 10), `options.binRange` (default `[40, 100]`), `options.stalenessMs` (filter old points). Returns empty score (0) if `e1RM <= 0`. |
| `identifyCoverageGaps(coverage, minObservations = 1)` | `:132-137` | Bins below the threshold count. |

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

(`src/vbt/profile-fitting.ts:20-35`.)

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

(`src/vbt/profile-fitting.ts:40-46`.)

### Internals

| Helper | Source line |
| --- | --- |
| `weightedLeastSquares(xs, ys, weights)` | `:56-89` |
| `computeWeightedRSquared(xs, ys, weights, slope, intercept)` | `:94-121` |
| `computeUncertainty(xs, ys, weights, slope, intercept)` | `:126-164` — needs n ≥ 3, MSE-scaled standard errors. |
| `huberWeight(residual, delta)` | `:170-174` — `1` if `|r| ≤ δ`, else `δ / |r|`. |

### `fitLVProfile`

`fitLVProfile(dataPoints, options?)` at `src/vbt/profile-fitting.ts:194-314`.

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
| `src/vbt/constants.ts:22-26` | Gonzalez-Badillo et al. — `VELOCITY_AT_PERCENT_1RM` table. |
| `src/vbt/constants.ts:46-50` | RepOne — individual MVT variability. |
| `src/vbt/constants.ts:54-59` | Rodiles-Guerrero 2020 — cable-machine velocity-loss-to-fatigue mapping. |
| `src/vbt/profile.ts:6-10` | PLoS ONE 2019 — linear over polynomial; machine R² > 0.93. |
| `src/analytics/intensity.ts:7-11` | Robinson et al. 2024, Refalo 2024, Martikainen 2025 — hardness decay rate. |
| `src/analytics/intensity.ts:99-104` | Robinson 2024 meta-regression — gradual dose-response near failure. |
| `src/analytics/intensity.ts:39-44` | J Strength Cond Res 2020 — velocity-loss vs reps-completed R²=0.93-0.97. |
