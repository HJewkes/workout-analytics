# Analytics surface

Inventory of every public function in `src/analytics/`. For VBT-specific surface (LV profile, e1RM, coverage, baselines, advanced fitting) see `vbt.md`. For the underlying primitives (`Rep`, `Set`, `Phase`) see `data-model.md`.

## Table of contents

- [Rep analytics](#rep-analytics)
- [Set analytics](#set-analytics)
- [Quality analytics](#quality-analytics)
- [Fatigue analytics](#fatigue-analytics)
- [Intensity analytics](#intensity-analytics)
- [Session analytics](#session-analytics)
- [Shared types and helpers](#shared-types-and-helpers)

---

## Rep analytics

Source: `src/analytics/rep-analytics.ts`. All functions take a single `Rep`. Re-exported via `src/index.ts` and `src/analytics/index.ts`.

| Function | Returns | Notes |
| --- | --- | --- |
| `getRepMeanEccentricVelocity(rep)` | `number` (m/s) | Eccentric phase mean velocity. |
| `getRepMeanConcentricForce(rep)` | `number` (lbs) | |
| `getRepPeakConcentricForce(rep)` | `number` (lbs) | |
| `getRepMeanEccentricForce(rep)` | `number` (lbs) | |
| `getRepPeakEccentricForce(rep)` | `number` (lbs) | |
| `getRepConcentricTime(rep)` | `number` (s) | Movement time only (excludes holds). |
| `getRepEccentricTime(rep)` | `number` (s) | Movement time only. |
| `getRepImpulse(rep)` | `number` (**lbs·s**) | Trapezoidal ∫ F dt over concentric. **Inflates 10× if force is in tenths-lbs.** |
| `getRepWork(rep)` | `number` (**lbs·m**) | Trapezoidal ∫ F dx over concentric. NOT joules — `force` is lbs, `position` is metres (2.0.0). |
| `getRepTotalImpulse(rep)` | `number` | Concentric + eccentric. |
| `getRepConcentricImpulse(rep)` | `number` | Alias for `getRepImpulse`. |
| `getRepEccentricImpulse(rep)` | `number` | Trapezoidal over eccentric samples. |
| `getRepTotalWork(rep)` | `number` | Concentric + eccentric. |
| `getRepConcentricWork(rep)` | `number` | Alias for `getRepWork`. |
| `getRepEccentricWork(rep)` | `number` | |
| `getRepMeanConcentricPower(rep)` | `number` (**lbs·m/s**) | `getRepConcentricWork / getRepConcentricTime`. NOT Watts. |
| `getRepMeanEccentricPower(rep)` | `number` | |

Plus the model-level rep functions in `src/models/rep.ts` (re-exported from the root):
`getRepDuration`, `getRepTempo`, `getRepMeanVelocity`, `getRepPeakVelocity`, `getRepPeakForce`, `getRepMeanLoad`, `getRepPeakLoad`, `getRepRangeOfMotion`, `getRepSamples`.

## Set analytics

Source: `src/analytics/set-analytics.ts`. Re-exported via `src/index.ts`.

### Velocity

| Function | Returns | Notes |
| --- | --- | --- |
| `getSetFirstRepVelocity(set)` | `number` | |
| `getSetLastRepVelocity(set)` | `number` | |
| `getSetBestRepVelocity(set)` | `number` | |
| `getSetVelocityLossPct(set)` | `number` (%) | `(VBest − VLast) / VBest × 100`, best/fastest-rep reference (WA-D01), not first-rep. Always ≥ 0. |
| `getSetMeanVelocity(set)` | `number` | |
| `getSetPeakVelocity(set)` | `number` | |
| `getSetRepVelocities(set)` | `number[]` | |

### Eccentric velocity

| Function | Returns | Notes |
| --- | --- | --- |
| `getSetFirstRepEccentricVelocity(set)` | `number` | |
| `getSetLastRepEccentricVelocity(set)` | `number` | |
| `getSetMeanEccentricVelocity(set)` | `number` | |
| `getSetRepEccentricVelocities(set)` | `number[]` | |
| `getSetEccentricVelocityChangePct(set)` | `number` (%) | `(VEcc_last − VEcc_first) / VEcc_first × 100`. Positive = speeding up = loss of control. |

### Range of motion

All ROM metrics are **displacement traversed** during the concentric phase (`|end − start| position`), not absolute top-of-rep position — via `getRepRangeOfMotion` → `getPhaseRangeOfMotion(concentric)`. This matters for partial reps / non-zero-start reps, where absolute position over-reports (WA-02.03).

| Function | Returns | Notes |
| --- | --- | --- |
| `getSetMeanROM(set)` | `number` | |
| `getSetBestROM(set)` | `number` | |
| `getSetFirstRepROM(set)` | `number` | |
| `getSetLastRepROM(set)` | `number` | |
| `getSetRepROMs(set)` | `number[]` | |

### Per-rep accessors

| Function | Returns | Notes |
| --- | --- | --- |
| `getSetRepVelocityAt(set, repNumber)` | `number` | (1-based index) |
| `getSetRepROMAt(set, repNumber)` | `number` | (1-based index) |

### Summary

`SetVelocitySummary` interface; `getSetVelocitySummary(set)`. Returns `{ first, last, best, mean, peak, lossPct, repCount }`.

Plus the model-level set functions in `src/models/set.ts`: `getSetRepCount`, `getSetDuration`, `getSetTimeUnderTension`, `getSetLoad`, `getSetMeanLoad`, `getSetPeakLoad`.

## Quality analytics

Source: `src/analytics/quality.ts`. Assesses individual reps against expectations (fixed values or distributions). Uses `TechniqueBaseline` from `src/analytics/types.ts`.

### Types

| Type | Definition | Notes |
| --- | --- | --- |
| `RepQualityFlags` | `{ partialRep, eccRushed, velocityOutlier, overallQuality: 'good'/'warning'/'poor' }` | |
| `QualitySchemes` | Extends `ComparisonSchemes` with `partialRep`, `eccRushed`, `quality` schemes. | |
| `RepQualityAssessment` | `{ flags, romComparison, eccentricComparison, velocityComparison }` | |

### Defaults

| Constant | Threshold | Notes |
| --- | --- | --- |
| `DEFAULT_PARTIAL_REP_SCHEME` | ROM < 80% expected → partial | |
| `DEFAULT_ECC_RUSHED_SCHEME` | Eccentric time < 60% expected → rushed | |

### Functions

| Function | Returns | Notes |
| --- | --- | --- |
| `assessRepROM(rep, expectation, schemes?)` | `ComparisonResult` | |
| `assessRepEccentricControl(rep, expectation, schemes?)` | `ComparisonResult` | |
| `assessRepVelocity(rep, expectation, schemes?)` | `ComparisonResult` | |
| `getRepQualityFlags(rep, baseline, schemes?)` | `RepQualityFlags` | |
| `isPartialRep(rep, expectedROM, threshold=0.8)` | `boolean` | |
| `isEccentricRushed(rep, expectedEccTime, threshold=0.6)` | `boolean` | |
| `getRepROMRatio(rep, expectedROM)` | `number` | |
| `getRepEccentricTimeRatio(rep, expectedEccTime)` | `number` | |
| `getRepVelocityRatio(rep, expectedVelocity)` | `number` | |
| `assessRepQuality(rep, baseline, schemes?)` | `RepQualityAssessment` | |

`overallQuality` is determined by the **worst** ratio across ROM / eccentric / velocity, classified via `DEFAULT_QUALITY_SCHEME` (`good ≥ 0.95 ratio, warning ≥ 0.80, poor below`, see `src/stats/schemes.ts`).

## Fatigue analytics

Source: `src/analytics/fatigue.ts`. Set-level fatigue, RIR, consistency, outliers.

### Types

| Type | Description |
| --- | --- |
| `FatigueSchemes` | RIR (interpolation), consistency (breakpoint), `outlierAlpha` (Grubbs significance level). `outlier` (breakpoint) is deprecated and no longer read by `findOutlierReps`. |
| `FatigueIndex` | `value` (0-100), `components` (velocityChange, tempoChange, romChange), `confidence`. |
| `ConsistencyScore` | CV per metric + overall classification. |
| `RIREstimate` | `rir`, `rpe = 10 - rir`, confidence. |
| `OutlierRep` | `{ repNumber, metric, zScore, direction, criticalValue }`. |
| `EccentricControl` | `score` (0-100), `eccentricChangePct`, `formWarning`. |
| `FatigueSummary` | Quick display: `velocityLossPct`, `rir`, `rpe`, `consistency`, `fatigueLevel`. |

### Constants

`DEFAULT_FATIGUE_WEIGHTS = { velocity: 0.6, tempo: 0.25, rom: 0.15 }`.

### Change analytics (first → last rep)

| Function | Notes |
| --- | --- |
| `getSetVelocityChange(set, historicalDist?)` | |
| `getSetTempoChange(set, historicalDist?)` | |
| `getSetROMChange(set, historicalDist?)` | |
| `getSetEccentricVelocityChange(set, historicalDist?)` | |

All return `ChangeResult` from `src/analytics/types.ts`.

### Eccentric control

| Function | Notes |
| --- | --- |
| `getSetEccentricControlScore(set)` | Returns 100 for sets with < 2 reps. Each 1% eccentric speed-up costs 2 points. |
| `getSetFormWarning(set)` | Returns string warning or `null`. |
| `getSetEccentricControl(set)` | Composite `EccentricControl`. |

### Fatigue index

`getSetFatigueIndex(set, weights = DEFAULT_FATIGUE_WEIGHTS)`. Combines velocity loss, tempo creep, and ROM decay into a 0-100 score. Confidence = high (≥4 reps), medium (≥2), low otherwise.

### Distributions and consistency

| Function | Notes |
| --- | --- |
| `getSetVelocityDistribution(set)` | |
| `getSetROMDistribution(set)` | |
| `getSetTempoDistribution(set)` | |
| `getSetConsistencyScore(set, schemes?)` | |

### Outliers and RIR

| Function | Notes |
| --- | --- |
| `findOutlierReps(set, schemes?)` | Requires ≥3 reps. Compares each metric's largest within-set \|z\| against Grubbs' critical value for the rep count (`src/stats/grubbs.ts`), so at most one rep per metric is returned. A fixed z cut cannot work here: Samuelson's inequality bounds \|z\| at `(n-1)/√n`. |
| `estimateSetRIR(set, schemes?)` | Interpolates from velocity loss % via `DEFAULT_RIR_SCHEME`. RIR clamped to `[0, 6]`, RPE to `[4, 10]`. |
| `isSetFatigued(set, threshold=20)` | Velocity loss > threshold. |
| `getSetFatigueSummary(set)` | Composite summary with `fatigueLevel: 'low'/'moderate'/'high'`. |

## Intensity analytics

Source: `src/analytics/intensity.ts`. Per-rep RIR derivation, hardness weighting, set scoring.

| Function | Notes |
| --- | --- |
| `estimatePerRepRIR(set, setRIR?)` | Velocity-proportional interpolation along the set's velocity decay curve. Falls back to linear `+1 per rep` when velocity data is noisy. Default `setRIR` from `estimateSetRIR(set)`. |
| `getRepHardnessWeight(rir, decayRate=0.4)` | `e^(-k*rir)`. RIR 0 = 1.00, RIR 1 = 0.67, RIR 2 = 0.45, RIR 3 = 0.30. |
| `getSetIntensityScore(set, options?)` | Sum of per-rep hardness weights = "effective stimulus reps". |
| `getSetStimulusScore(set, load?, options?)` | `Σ hardness[i] × load × (romFactor × tutFactor)?` over reps. Optionally normalized by `e1RM`. **Voltra-specific heuristic, not a published metric** (its docstring). |

`DEFAULT_DECAY_RATE = 0.4`. Research basis cited in the module header (Robinson 2024, Refalo 2024, Martikainen 2025; per-rep RIR R²=0.93-0.97 J Strength Cond Res 2020).

## Session analytics

Source: `src/analytics/session.ts`. Session-level estimates from arrays of `Set`.

### Types

| Type | Fields |
| --- | --- |
| `StrengthEstimate` | `estimated1RM`, `confidence`, `source: 'profile' \| 'reps' \| 'hybrid'`. |
| `ReadinessEstimate` | `zone: 'green' \| 'yellow' \| 'red'`, `velocityRatio`, `confidence`, optional `baselineAvailable` (`false` when either velocity is missing, zero, negative or non-finite). |
| `SessionFatigueEstimate` | `level` (0-1), `velocityRecoveryPct`, `repDropPct`, `isJunkVolume`. |

### Functions

| Function | Notes |
| --- | --- |
| `computeStrengthEstimate(sets, weights?, profile?)` | Rep-based Epley from the set with the highest e1RM × confidence (ties to the higher e1RM) among sets whose e1RM is at least 0.85 of the session's highest, and profile-based MVT-solve. Hybrid when both available. |
| `computeReadiness(actualVelocity, baselineVelocity)` | Green ≥ 95%, yellow ≥ 85%, red below. Both inputs are first-rep mean concentric velocity. An unusable input returns yellow with `confidence: 0` and `baselineAvailable: false`. |
| `computeSessionFatigue(sets, weights?)` | Composite: velocity recovery (40%) + rep drop (30%) + average within-set vel loss (30%). `isJunkVolume` when velocity recovery < 75% AND avg loss > 40%. |
| `computeVolume(sets, weights?)` | `Σ load × reps`. |
| `computeEffectiveVolume(sets, weights?, options?)` | `Σ Σ hardness[i] × load`. |

`weights` is an optional parallel array; falls back to `getSetLoad(set)` per index.

## Shared types and helpers

Source: `src/analytics/types.ts`. Used across quality / fatigue / VBT modules.

### `Expectation<T>`

Either `{ kind: 'fixed', value }` or `{ kind: 'distribution', dist: StreamingDistribution }`. Used as a baseline for per-rep / per-set comparisons.

| Function | Notes |
| --- | --- |
| `createFixedExpectation(value)` | |
| `createDistributionExpectation(dist)` | |
| `getExpectedValue(expectation)` | |
| `compareToExpectation(actual, expectation, schemes?)` | |
| `computeChange(first, last, dist?)` | |
| `hasDistribution(expectation)` | |
| `getExpectationStdDev(expectation)` | |

### `TechniqueBaseline`

Bundle of expectations for ROM, eccentric time, concentric time, mean velocity. Built via `createTechniqueBaseline(options)`; each field accepts either a fixed number or a `StreamingDistribution`.

### `ComparisonResult` and `ChangeResult`

`ComparisonResult`: `{ ratio, zScore, isOutlier, confidence }`.
`ChangeResult`: `{ first, last, absoluteChange, percentChange, zScore }`.
