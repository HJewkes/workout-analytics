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

Source: `src/analytics/rep-analytics.ts`. All functions take a single `Rep`. Re-exported via `src/index.ts:117-135` and `src/analytics/index.ts:24-42`.

| Function | Returns | Source line | Notes |
| --- | --- | --- | --- |
| `getRepMeanEccentricVelocity(rep)` | `number` (m/s) | `:19-21` | Eccentric phase mean velocity. |
| `getRepMeanConcentricForce(rep)` | `number` (lbs) | `:31-33` | |
| `getRepPeakConcentricForce(rep)` | `number` (lbs) | `:39-41` | |
| `getRepMeanEccentricForce(rep)` | `number` (lbs) | `:47-49` | |
| `getRepPeakEccentricForce(rep)` | `number` (lbs) | `:55-57` | |
| `getRepConcentricTime(rep)` | `number` (s) | `:67-69` | Movement time only (excludes holds). |
| `getRepEccentricTime(rep)` | `number` (s) | `:75-77` | Movement time only. |
| `getRepImpulse(rep)` | `number` (**lbs·s**) | `:95-117` | Trapezoidal ∫ F dt over concentric. **Inflates 10× if force is in tenths-lbs.** |
| `getRepWork(rep)` | `number` (**lbs·position-units**) | `:135-157` | Trapezoidal ∫ F dx over concentric. NOT joules — `position` is normalized 0..1. |
| `getRepTotalImpulse(rep)` | `number` | `:162-164` | Concentric + eccentric. |
| `getRepConcentricImpulse(rep)` | `number` | `:169-171` | Alias for `getRepImpulse`. |
| `getRepEccentricImpulse(rep)` | `number` | `:176-193` | Trapezoidal over eccentric samples. |
| `getRepTotalWork(rep)` | `number` | `:198-200` | Concentric + eccentric. |
| `getRepConcentricWork(rep)` | `number` | `:205-207` | Alias for `getRepWork`. |
| `getRepEccentricWork(rep)` | `number` | `:212-229` | |
| `getRepMeanConcentricPower(rep)` | `number` (**lbs·position-units / s**) | `:244-248` | `getRepConcentricWork / getRepConcentricTime`. NOT Watts. |
| `getRepMeanEccentricPower(rep)` | `number` | `:254-258` | |

Plus the model-level rep functions in `src/models/rep.ts` (re-exported from the root):
`getRepDuration`, `getRepTempo`, `getRepMeanVelocity`, `getRepPeakVelocity`, `getRepPeakForce`, `getRepMeanLoad`, `getRepPeakLoad`, `getRepRangeOfMotion`, `getRepSamples`.

## Set analytics

Source: `src/analytics/set-analytics.ts`. Re-exported via `src/index.ts:138-160`.

### Velocity

| Function | Returns | Source line |
| --- | --- | --- |
| `getSetFirstRepVelocity(set)` | `number` | `:20-24` |
| `getSetLastRepVelocity(set)` | `number` | `:30-34` |
| `getSetBestRepVelocity(set)` | `number` | `:40-43` |
| `getSetVelocityLossPct(set)` | `number` (%) | `:61-66` — `(VBest − VLast) / VBest × 100`, best/fastest-rep reference (WA-D01), not first-rep. Always ≥ 0. |
| `getSetMeanVelocity(set)` | `number` | `:62-66` |
| `getSetPeakVelocity(set)` | `number` | `:72-75` |
| `getSetRepVelocities(set)` | `number[]` | `:81-83` |

### Eccentric velocity

| Function | Returns | Source line |
| --- | --- | --- |
| `getSetFirstRepEccentricVelocity(set)` | `number` | `:93-97` |
| `getSetLastRepEccentricVelocity(set)` | `number` | `:103-107` |
| `getSetMeanEccentricVelocity(set)` | `number` | `:113-117` |
| `getSetRepEccentricVelocities(set)` | `number[]` | `:123-125` |
| `getSetEccentricVelocityChangePct(set)` | `number` (%) | `:133-138` — `(VEcc_last − VEcc_first) / VEcc_first × 100`. Positive = speeding up = loss of control. |

### Range of motion

All ROM metrics are **displacement traversed** during the concentric phase (`|end − start| position`), not absolute top-of-rep position — via `getRepRangeOfMotion` → `getPhaseRangeOfMotion(concentric)`. This matters for partial reps / non-zero-start reps, where absolute position over-reports (WA-02.03).

| Function | Returns | Source line |
| --- | --- | --- |
| `getSetMeanROM(set)` | `number` | `:148-152` |
| `getSetBestROM(set)` | `number` | `:158-161` |
| `getSetFirstRepROM(set)` | `number` | `:167-171` |
| `getSetLastRepROM(set)` | `number` | `:177-181` |
| `getSetRepROMs(set)` | `number[]` | `:187-189` |

### Per-rep accessors

| Function | Returns | Source line |
| --- | --- | --- |
| `getSetRepVelocityAt(set, repNumber)` | `number` | `:199-203` (1-based index) |
| `getSetRepROMAt(set, repNumber)` | `number` | `:209-213` (1-based index) |

### Summary

`SetVelocitySummary` interface at `:222-230`; `getSetVelocitySummary(set)` at `:235-245`. Returns `{ first, last, best, mean, peak, lossPct, repCount }`.

Plus the model-level set functions in `src/models/set.ts`: `getSetRepCount`, `getSetDuration`, `getSetTimeUnderTension`, `getSetLoad`, `getSetMeanLoad`, `getSetPeakLoad`.

## Quality analytics

Source: `src/analytics/quality.ts`. Assesses individual reps against expectations (fixed values or distributions). Uses `TechniqueBaseline` from `src/analytics/types.ts:63-72`.

### Types

| Type | Definition | Source line |
| --- | --- | --- |
| `RepQualityFlags` | `{ partialRep, eccRushed, velocityOutlier, overallQuality: 'good'/'warning'/'poor' }` | `:32-41` |
| `QualitySchemes` | Extends `ComparisonSchemes` with `partialRep`, `eccRushed`, `quality` schemes. | `:46-55` |
| `RepQualityAssessment` | `{ flags, romComparison, eccentricComparison, velocityComparison }` | `:207-212` |

### Defaults

| Constant | Threshold | Source line |
| --- | --- | --- |
| `DEFAULT_PARTIAL_REP_SCHEME` | ROM < 80% expected → partial | `:60-63` |
| `DEFAULT_ECC_RUSHED_SCHEME` | Eccentric time < 60% expected → rushed | `:68-71` |

### Functions

| Function | Returns | Source line |
| --- | --- | --- |
| `assessRepROM(rep, expectation, schemes?)` | `ComparisonResult` | `:80-87` |
| `assessRepEccentricControl(rep, expectation, schemes?)` | `ComparisonResult` | `:92-99` |
| `assessRepVelocity(rep, expectation, schemes?)` | `ComparisonResult` | `:104-111` |
| `getRepQualityFlags(rep, baseline, schemes?)` | `RepQualityFlags` | `:120-150` |
| `isPartialRep(rep, expectedROM, threshold=0.8)` | `boolean` | `:159-162` |
| `isEccentricRushed(rep, expectedEccTime, threshold=0.6)` | `boolean` | `:167-174` |
| `getRepROMRatio(rep, expectedROM)` | `number` | `:179-182` |
| `getRepEccentricTimeRatio(rep, expectedEccTime)` | `number` | `:187-190` |
| `getRepVelocityRatio(rep, expectedVelocity)` | `number` | `:195-198` |
| `assessRepQuality(rep, baseline, schemes?)` | `RepQualityAssessment` | `:217-233` |

`overallQuality` is determined by the **worst** ratio across ROM / eccentric / velocity, classified via `DEFAULT_QUALITY_SCHEME` (`good ≥ 0.95 ratio, warning ≥ 0.80, poor below`, see `src/stats/schemes.ts:203-209`).

## Fatigue analytics

Source: `src/analytics/fatigue.ts`. Set-level fatigue, RIR, consistency, outliers.

### Types

| Type | Source line | Description |
| --- | --- | --- |
| `FatigueSchemes` | `:46-53` | RIR (interpolation), consistency (breakpoint), outlier (breakpoint). |
| `FatigueIndex` | `:58-69` | `value` (0-100), `components` (velocityChange, tempoChange, romChange), `confidence`. |
| `ConsistencyScore` | `:74-83` | CV per metric + overall classification. |
| `RIREstimate` | `:88-95` | `rir`, `rpe = 10 - rir`, confidence. |
| `OutlierRep` | `:100-109` | `{ repNumber, metric, zScore, direction }`. |
| `EccentricControl` | `:173-180` | `score` (0-100), `eccentricChangePct`, `formWarning`. |
| `FatigueSummary` | `:463-469` | Quick display: `velocityLossPct`, `rir`, `rpe`, `consistency`, `fatigueLevel`. |

### Constants

`DEFAULT_FATIGUE_WEIGHTS = { velocity: 0.6, tempo: 0.25, rom: 0.15 }` at `:239-243`.

### Change analytics (first → last rep)

| Function | Source line |
| --- | --- |
| `getSetVelocityChange(set, historicalDist?)` | `:118-125` |
| `getSetTempoChange(set, historicalDist?)` | `:130-138` |
| `getSetROMChange(set, historicalDist?)` | `:143-151` |
| `getSetEccentricVelocityChange(set, historicalDist?)` | `:157-164` |

All return `ChangeResult` from `src/analytics/types.ts:46-57`.

### Eccentric control

| Function | Source line | Notes |
| --- | --- | --- |
| `getSetEccentricControlScore(set)` | `:191-197` | Returns 100 for sets with < 2 reps. Each 1% eccentric speed-up costs 2 points. |
| `getSetFormWarning(set)` | `:204-218` | Returns string warning or `null`. |
| `getSetEccentricControl(set)` | `:223-229` | Composite `EccentricControl`. |

### Fatigue index

`getSetFatigueIndex(set, weights = DEFAULT_FATIGUE_WEIGHTS)` at `:253-294`. Combines velocity loss, tempo creep, and ROM decay into a 0-100 score. Confidence = high (≥4 reps), medium (≥2), low otherwise.

### Distributions and consistency

| Function | Source line |
| --- | --- |
| `getSetVelocityDistribution(set)` | `:310-312` |
| `getSetROMDistribution(set)` | `:317-319` |
| `getSetTempoDistribution(set)` | `:324-326` |
| `getSetConsistencyScore(set, schemes?)` | `:331-352` |

### Outliers and RIR

| Function | Source line | Notes |
| --- | --- | --- |
| `findOutlierReps(set, schemes?)` | `:361-415` | Requires ≥3 reps. Per-rep z-score on velocity / ROM / tempo. |
| `estimateSetRIR(set, schemes?)` | `:424-447` | Interpolates from velocity loss % via `DEFAULT_RIR_SCHEME`. RIR clamped to `[0, 6]`, RPE to `[4, 10]`. |
| `isSetFatigued(set, threshold=20)` | `:456-458` | Velocity loss > threshold. |
| `getSetFatigueSummary(set)` | `:474-495` | Composite summary with `fatigueLevel: 'low'/'moderate'/'high'`. |

## Intensity analytics

Source: `src/analytics/intensity.ts`. Per-rep RIR derivation, hardness weighting, set scoring.

| Function | Source line | Notes |
| --- | --- | --- |
| `estimatePerRepRIR(set, setRIR?)` | `:50-87` | Velocity-proportional interpolation along the set's velocity decay curve. Falls back to linear `+1 per rep` when velocity data is noisy. Default `setRIR` from `estimateSetRIR(set)`. |
| `getRepHardnessWeight(rir, decayRate=0.4)` | `:107-110` | `e^(-k*rir)`. RIR 0 = 1.00, RIR 1 = 0.67, RIR 2 = 0.45, RIR 3 = 0.30. |
| `getSetIntensityScore(set, options?)` | `:127-135` | Sum of per-rep hardness weights = "effective stimulus reps". |
| `getSetStimulusScore(set, load?, options?)` | `:164-212` | `Σ hardness[i] × load × (romFactor × tutFactor)?` over reps. Optionally normalized by `e1RM`. **Voltra-specific heuristic, not a published metric** (`:154-160`). |

`DEFAULT_DECAY_RATE = 0.4` at `:24`. Research basis cited at `:7-11` (Robinson 2024, Refalo 2024, Martikainen 2025; per-rep RIR R²=0.93-0.97 J Strength Cond Res 2020).

## Session analytics

Source: `src/analytics/session.ts`. Session-level estimates from arrays of `Set`.

### Types

| Type | Source line | Fields |
| --- | --- | --- |
| `StrengthEstimate` | `:27-34` | `estimated1RM`, `confidence`, `source: 'profile' \| 'reps' \| 'hybrid'`. |
| `ReadinessEstimate` | `:39-46` | `zone: 'green' \| 'yellow' \| 'red'`, `velocityRatio`, `confidence`. |
| `SessionFatigueEstimate` | `:51-60` | `level` (0-1), `velocityRecoveryPct`, `repDropPct`, `isJunkVolume`. |

### Functions

| Function | Source line | Notes |
| --- | --- | --- |
| `computeStrengthEstimate(sets, weights?, profile?)` | `:78-126` | Best of: rep-based Epley (per set) and profile-based MVT-solve. Hybrid when both available. |
| `computeReadiness(actualVelocity, baselineVelocity)` | `:143-168` | Green ≥ 95%, yellow ≥ 85%, red below. |
| `computeSessionFatigue(sets, weights?)` | `:187-237` | Composite: velocity recovery (40%) + rep drop (30%) + average within-set vel loss (30%). `isJunkVolume` when velocity recovery < 75% AND avg loss > 40%. |
| `computeVolume(sets, weights?)` | `:250-257` | `Σ load × reps`. |
| `computeEffectiveVolume(sets, weights?, options?)` | `:273-291` | `Σ Σ hardness[i] × load`. |

`weights` is an optional parallel array; falls back to `getSetLoad(set)` per index.

## Shared types and helpers

Source: `src/analytics/types.ts`. Used across quality / fatigue / VBT modules.

### `Expectation<T>`

Either `{ kind: 'fixed', value }` or `{ kind: 'distribution', dist: StreamingDistribution }`. Used as a baseline for per-rep / per-set comparisons.

| Function | Source line |
| --- | --- |
| `createFixedExpectation(value)` | `:81-83` |
| `createDistributionExpectation(dist)` | `:88-90` |
| `getExpectedValue(expectation)` | `:97-102` |
| `compareToExpectation(actual, expectation, schemes?)` | `:121-151` |
| `computeChange(first, last, dist?)` | `:161-178` |
| `hasDistribution(expectation)` | `:220-222` |
| `getExpectationStdDev(expectation)` | `:228-233` |

### `TechniqueBaseline`

Bundle of expectations for ROM, eccentric time, concentric time, mean velocity (`:63-72`). Built via `createTechniqueBaseline(options)` (`:208-215`); each field accepts either a fixed number or a `StreamingDistribution`.

### `ComparisonResult` and `ChangeResult`

`ComparisonResult` (`:31-40`): `{ ratio, zScore, isOutlier, confidence }`.
`ChangeResult` (`:46-57`): `{ first, last, absoluteChange, percentChange, zScore }`.
