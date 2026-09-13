# Changelog

All notable changes to `@voltras/workout-analytics` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`isHoldOrIdleSample` (VW-234).** The `sample.phase === HOLD || sample.phase === IDLE` check existed as four separate copies with no shared function — `addSampleToPhase`'s insertion-time exclusion, `addSampleToRep`'s phase-routing, `getPhaseVelocityEnvelope`'s array-filter, and `rep-analytics`'s `excludeHoldAndIdle` — so a future new pause-like phase would need updating in four places to stay consistent. Now exported once from `@voltras/workout-analytics` and called from all four sites. No behavior change — the same samples are excluded as before.

### Changed

- **BREAKING: `updateBaselineWithPoint` evicts by age as documented, not by load (KNOWN-ISSUES-2026-07-27 §4).** The JSDoc said `opts.timestamp` "defaults to `Date.now()`"; the implementation only spread a timestamp when one was passed explicitly. So a baseline whose points carried no timestamp could never satisfy the `hasTimestamps` guard, eviction always fell through to `combined.slice(1)`, and because `buildBaseline` load-sorts, that dropped the **lowest-load** point on every capped update. The load-velocity profile was eaten from below.

  **What changed.** The documented default is implemented: the new point is stamped `opts.timestamp ?? Date.now()`. An absent `timestamp` now ranks **older than any present one** — age unknown, and the baseline predates the write adding a stamped point. Within a tied cohort (all-legacy points, or two writes in the same millisecond) the evicted point is the one of **lowest regression leverage**, `(load − meanLoad)² / Σ(load − meanLoad)²`, i.e. the point nearest the mean load, whose removal perturbs the fitted slope and intercept least. Lowest load is never privileged. This also changes tie-breaking for a **fully-timestamped** baseline: the old code kept the first point it saw at the minimum timestamp, so on a tie the surviving point depended on array order; the new rule picks by leverage instead, which is the better tie-break but is a behaviour change from the old code for that case too, not only for the untimestamped one described below.

  **Untimestamped legacy points are not back-stamped, and that is the decision.** The two candidate policies were insertion-order eviction and rebuilding the timestamp set on the first write. Insertion order is **not implementable**: `buildBaseline` sorts by load, so a baseline that has been through `serializeBaseline`/`deserializeBaseline` has had its insertion order overwritten by load order at rest — "first element" is the lowest load, which is exactly the defect. Rebuilding the timestamp set was rejected because `LoadVelocityDataPoint.timestamp` documents a **real observation time** and is read for recency weighting: stamping a point observed months ago with `Date.now() − 1` would put a fabricated age on the wire, corrupting anything that reads it. So a legacy point keeps no timestamp, `serializeBaseline` output for it is byte-identical, and the unknown-age cohort is handled by the ranking rule above.

  **How a legacy caller learns the behaviour changed.** The first eviction from an untimestamped baseline anywhere in the process logs a one-time `console.warn` naming the old lowest-load behaviour and the new rule — the "warned" flag is a single module-level boolean, once per process rather than per baseline, so a second untimestamped baseline's first eviction stays silent once any earlier one has warned. This mirrors `FatigueSchemes.outlier`'s warning below. It fires only when a cap actually forces an eviction, never when every point is stamped. Stamping points with `timestamp` gets true age-ordered eviction and silences it.

  **What moves, quantified.** On a slightly convex six-point fixture (loads 40–90, `maxPoints: 6`, three working-load observations added at 70/75/80):

  | | retained loads | V0 (`intercept`) | `estimated1RM` |
  | --- | --- | --- | --- |
  | before any update | 40,50,60,70,80,90 | 1.4733 | 118.485 |
  | old policy, 3 updates | 70,70,75,80,80,90 | 1.3580 (−7.8%) | 124.197 (**+4.8%**) |
  | new policy, 3 updates | 40,50,70,75,80,90 | 1.4803 (+0.5%) | 118.142 (−0.3%) |

  The filed finding called the bias "upward" in the intercept. That is **not unconditional** — the direction depends on the curvature of the true load-velocity relationship. Truncating the low end of a convex profile flattens the slope, pulling V0 down and pushing the 1RM estimate up; a concave profile moves both the other way. Real profiles over 40–90% are slightly convex, so the symptom callers would have seen is an estimated 1RM creeping upward with no corresponding training.

  **`voltras-mcp` is not affected.** Its `strength.e1rm` and `vbt.rir` go through `buildProfile` / `estimateE1RMFromProfile` / `estimateRIRWithProfile` on `LoadVelocityDataPoint[]` assembled directly from stored set rows (`src/tools/metrics-tools.ts:1060-1072`, `:243-249`). It never constructs a `VelocityBaseline` and never calls `updateBaselineWithPoint`, so no MCP output moves — which matters, because an estimated 1RM that shifts for no visible reason is the failure this change is guarding against.

  No cap, age cutoff or minimum point count was introduced. One point is still dropped per over-cap update, as before.

- **BREAKING: `analyzeTrend`'s flat threshold is now per metric, and `TrendAnalysis.direction` can be `null` (KNOWN-ISSUES-2026-07-27 §6).** The threshold defaulted to `0.001` per day — an absolute constant on a `TimeSeries` that carries no units, while `MetricKey` spans velocity in m/s, volume in lbs and weight in lbs. It is now resolved from an explicit `flatThresholdPerDay`, else from `FLAT_THRESHOLD_PER_DAY[opts.metric]`, else not at all. A series with no resolvable threshold comes back with `direction: null` and its raw slope instead of a verdict, the shape `quality.hesitation` and `quality.bounce` already ship in. `TrendAnalysis` gains `flatThresholdPerDay`, the figure the verdict was reached under.

  **The alternative was rejected on purpose.** The finding offered scaling the threshold to the series (a fraction of its mean or SD) as the other fix. Nothing in this repo or in the RP corpus states what fraction of a mean or an SD counts as flat, so taking that route would have put an invented number at the centre of every trend verdict. A null verdict beside a real slope is the honest answer where no figure exists.

  **Only `velocity_mean` has a stated figure**, the existing `0.001` m/s/day. It is kept because that is the metric whose units the constant was written in — **not because it is validated**. Nothing derives it. The table is typed `Record<MetricKey, number | null>`, so a new metric (the ROM series the finding worried about) cannot be added without an explicit decision.

  **What moves for existing consumers.** Any call that supplied neither `metric` nor `flatThresholdPerDay` now gets `direction: null` where it used to get a verdict against `0.001`/day. `slope`, `intercept`, `rSquared`, `percentChange`, `pointCount`, `windowDays` and `confidence` are untouched. The old verdict is one argument away: `analyzeTrend(series, { flatThresholdPerDay: 0.001 })` reproduces it exactly, now visibly at the call site. Consumers that switch exhaustively on `direction` need a `null` arm to compile.

  `voltras-mcp`'s `history.trend` (`src/tools/metrics-tools.ts:580`) **is** such a caller, and its `trend.direction` does go null until it passes a threshold or a metric. Worth stating plainly: the finding said "every current caller is velocity-shaped", and that is **false** — `history.trend` runs on `top_weight`, `estimated_1rm` and `volume`, all in pounds. At 0.001 lb/day the threshold never bound, so `direction` was the sign of the slope whenever `rSquared > 0.3`, and a top weight creeping 0.365 lb a **year** came back as "up". The reading being withdrawn is one that had no basis in the first place; its `plateau` verdict, which is percentage-based and unit-free, is unaffected.

- **`findOutlierReps` now uses Grubbs' test instead of a fixed z-score cut (KNOWN-ISSUES-2026-07-27 §2).** It previously flagged `|z| >= 2.0` against the set's own distribution. Samuelson's inequality bounds that `|z|` at `(n-1)/√n`, so 2.0 was **unreachable for n ≤ 5** — a 3-, 4- or 5-rep set could not produce a result whatever the data, and most working sets are 3-5 reps. It now compares against `grubbsCriticalValue(n, alpha)` (NIST/SEMATECH e-Handbook §1.3.5.17), which stays strictly inside that bound at every n ≥ 3.

  **What moves for existing consumers**, all of it in `findOutlierReps` only:

  | n | old cut | new cut (α=0.05) | effect |
  | --- | --- | --- | --- |
  | 3 | 2.0 (unreachable, max 1.1547) | 1.1543 | can now fire |
  | 4 | 2.0 (unreachable, max 1.5000) | 1.4812 | can now fire |
  | 5 | 2.0 (unreachable, max 1.7889) | 1.7150 | can now fire |
  | 6 | 2.0 | 1.8871 | slightly more sensitive |
  | 7 | 2.0 | 2.0200 | slightly less sensitive |
  | 8 | 2.0 | 2.1266 | less sensitive |
  | 10 | 2.0 | 2.2900 | less sensitive |
  | 20 | 2.0 | 2.7082 | less sensitive |

  Two further behaviour changes: Grubbs tests one outlier at a time, so **at most one rep is returned per metric** (the largest `|z|`) where the old loop could return several; and `FatigueSchemes.outlier` is **no longer read by this function** (deprecated, replaced by `FatigueSchemes.outlierAlpha`). `DEFAULT_OUTLIER_SCHEME` itself is unchanged and still serves `compareToExpectation` and `getRepQualityFlags`, whose z-scores are against an external baseline where a fixed cut is sound.

- **Passing `FatigueSchemes.outlier` now logs a one-time `console.warn`.** A caller passing it is expressing an intent that does nothing, and silence would let a real behaviour change hide as a no-op for exactly the callers working from older knowledge. The warning names `outlierAlpha` and fires once per process, not per call.

  **ACTION FOR THE NEXT MAJOR: make `FatigueSchemes.outlier` THROW and drop the warning.** Throwing today would be correct on the merits but breaks callers without a major bump, so the warning is the interim step — it is not the intended end state. The same note is on the field's `@deprecated` comment in `src/analytics/fatigue.ts`.

  `voltras-mcp` does not call `findOutlierReps`, so its behaviour does not move.

### Added

- **`FLAT_THRESHOLD_PER_DAY` and `AnalyzeTrendOptions`, exported from the root barrel.** The per-metric flat-threshold table and the options type `analyzeTrend` now takes (`flatThresholdPerDay`, `metric`).
- **`TrendAnalysis.flatThresholdPerDay`** — the threshold the direction verdict was reached under, in the series' own units per day, or `null` when none was resolvable. Additive field; existing readers are unaffected.
- **`src/stats/grubbs.ts`, exported from the root barrel.** `grubbsCriticalValue(n, alpha)`, `isGrubbsOutlier(absZScore, n, alpha)`, `GRUBBS_DEFAULT_ALPHA` (0.05, the level the published table uses), `maxAbsZScore(n)` (Samuelson's bound), and `studentTTwoSidedTail(t, nu)` (closed-form Student's t for integer degrees of freedom, Abramowitz & Stegun 26.7.3 / 26.7.4 — no new dependency). All are verified in tests against published t and Grubbs critical-value tables, not against their own output.

  `isGrubbsOutlier` is the sole home of the `G > G_crit` comparison, deliberately: **the boundary is exclusive**, and equality with the critical value cannot be reached through constructed sample data because the critical value comes out of a bisection. Centralising the comparison makes the boundary directly testable by passing the critical value itself, which is the only way a `>` / `>=` slip becomes visible.
- **`OutlierRep.criticalValue`** — the Grubbs critical value a rep's z-score was compared against. Additive field; existing readers are unaffected.
- **`FatigueSchemes.outlierAlpha`** — significance level for Grubbs' test in `findOutlierReps`, default 0.05.

### Fixed

- **`detectPlateau` now evaluates longer windows after a shorter one fails (KNOWN-ISSUES-2026-07-27 §3).** The scan broke on the first failing window, on the reasoning that extending a failing run cannot rescue it. That is false: the reference is a **median**, which moves as the window grows. At `thresholdPct` 5 on `[95, 95, 102, 102]`, the window `[95, 102, 102]` fails on a median of 102, so the scan stopped and the full four-point window — median 98.5, maximum deviation 3.55% — was never tested. It reported `plateauDays: 1` over a run spanning 3 days. All n runs anchored at the most recent point are now tested; cost is O(n² log n) in the point count, which callers bucket by session, day or week.

  **Plateaus get longer, never shorter**, so `isPlateau` can flip false to true and never true to false. On 26-week weekly series (200 trials per shape, `thresholdPct` 5): a stepped top-weight progression moves in 10% of trials by +14 to +35 days; a steady e1RM climb in 12.5% by +14 to +56 days; noisy volume in 7.5% by +14 to +35 days, of which 3.5% flip `isPlateau` to true at the default 14-day minimum; a true stall at one weight never moves, having already spanned the window.

  `voltras-mcp`'s `history.trend` calls this function, so **its plateau readout does move**: longer runs, and a `plateauDays` of 0 stays 0. Its VW-150 diet-phase lookback is sized from `plateauDays`, so a longer plateau widens that window and makes a phase-straddling `'unknown'` marginally more likely.

- **`computeVBTSetFatigueIndex`'s docstring now matches its code (KNOWN-ISSUES-2026-07-27 §7).** The doc promised that an uncomputable augmentation's weight is "redistributed **proportionally** to the remaining components"; the code has always given all of it to velocity loss. **The doc was fixed, not the code — no index value moves.** Changing the code would have shifted the index for every single-rep and zero-baseline set, including in `voltras-mcp`'s live fatigue readout (`src/tools/metrics-tools.ts:293`). The VBT autoregulation spec §6.2 states no redistribution rule at all, which does not authorise either behaviour on its own — but it does rule out any claim that the spec *requires* proportional. With a live consumer already depending on the shipped value, that leaves the burden on a spec-driven change rather than on documenting reality. Tests now pin the velocity-absorbing arithmetic on both the ROM-missing and tempo-missing cases.

- **`getRepWork` and `getRepEccentricWork` now exclude HOLD/IDLE samples (KNOWN-ISSUES-2026-07-27 §5).** Both summed `Math.abs(Δposition)` sample-to-sample — path length, which accumulates every reversal — including reversals during a paused dwell that contributed no net movement. `getPhaseMeanVelocity` already excludes HOLD/IDLE from its running sum, and `getPhaseVelocityEnvelope` already filters an array on the identical predicate; both getters here now follow that same predicate rather than inventing a different one. It is duplicated, not shared — `phase.ts`'s two exclusions and this file's `excludeHoldAndIdle` are three independent copies with nothing calling any of the others, which is now tracked separately for consolidation. `getRepConcentricWork` (an alias for `getRepWork`) and `getRepMeanConcentricPower`/`getRepMeanEccentricPower` (work ÷ time) move with it.

  **What moves.** A fixture with a ±1mm IDLE zigzag immediately before a clean 50 lbf × 0.6 m raise went from 30.2 lbs·m (0.604 m path length) to 30 lbs·m (the true 0.6 m displacement) — work can only fall or stay the same, never rise, because the fix removes summed magnitude and adds none back. `getRepTotalWork` (untouched code, out of scope per the finding) still calls the fixed getters underneath, so its sum moves by the same amount its two inputs move by.

  **This does not close the finding's own worked example.** "1 mm of noise per sample on a 0.6 m raise inflates work by 1.83%" describes noise arriving already labeled as movement — no HOLD/IDLE sample present — which a phase-based filter cannot touch by construction. Verified directly: a fixture with the same ±1-2mm zigzag riding on a genuine CONCENTRIC-labeled climb still returns 30.6 lbs·m (2% over the true 30 lbs·m) identically before and after this fix. No movement-magnitude threshold was added to close that gap — none is sourced in this repo or the RP corpus, and inventing one was explicitly out of scope.

  `voltras-mcp`'s `repMeanConcentricPowerLbMps` (`src/state/channel-payloads.ts:124`) calls `getRepMeanConcentricPower`, so its pushed rep-power figure moves down (or stays the same) whenever a rep's concentric phase carried a HOLD/IDLE dwell with any positional jitter. Grep of `voltras-mcp/src` found no other caller of `getRepWork`, `getRepConcentricWork`, `getRepEccentricWork`, `getRepTotalWork`, or `getRepMeanEccentricPower`.

  **Version note:** this is an output-value-only change — no type or function signature moved — so it's categorized as a fix rather than tagged BREAKING, matching how `detectPlateau`'s and `findOutlierReps`'s numeric-drift fixes above were categorized. It ships alongside the already-forced MAJOR bump from `analyzeTrend`'s `direction: null` widening; on its own it would not have forced one.

### Documentation

- **README now documents the `/view` subpath, the full public entry-point list, and `npm run check:exports`.** The 2.3.0 `/view` subpath and the deprecated-root-re-export compatibility window went unmentioned in the README; both are now documented, alongside a complete table of the package's `exports`-map subpaths and what `check:exports` verifies.

## 2.3.0

### Added

- **`@voltras/workout-analytics/view` subpath (VW-64, 1/2).** The view-model functions (`estimateSetRpe`, `velocityLossVerdict`, `getSetRepPeakVelocities`, `getSetRepMeanVelocities`, `getSetTempoSeconds`, `bestE1RMAcrossSets`, `isNewE1RM`, `weightDeviationRatio`, `classifyWeeklyVolume`, and the `VolumeLandmarks` / `VolumeStatusName` / `VelocityLossVerdict` / `E1RMSetInput` types) are now reachable through a dedicated `./view` export, the intended sole consumer door for derived metrics. The root barrel keeps re-exporting them for one minor as a compatibility window (deprecated there).
- **Root re-exports of the weekly volume time-series API (VW-201).** `getWeeklySummaries`, `getVolumeByMuscleGroup`, `WeeklySummary`, `VolumeByMuscleGroup`, and `MetricKey` are exported from the package root; they were previously internal to `analytics/time-series`.
- **`npm run check:exports`.** Packs the library, installs the tarball into a scratch project, and imports every public door as a consumer would (`scripts/check-exports.mjs`).

## 2.1.0

### Added

- **Drift guard for cross-session comparability (VW-90 / B15).** `evaluateDriftGuard` and `summarizeSetsForDrift` compare median concentric tempo and ROM between a baseline session and a current session, and return a verdict (`comparable`, `flagged`, `reasoning`) that gates whether downstream cross-session analytics (progression detection, MRV/underperformance detection) should trust the comparison. A drift beyond 15% on either metric is flagged; beyond ~22.5% the comparison is marked not comparable. Sets with fewer than 4 qualifying reps are flagged rather than trusted outright. This is the foundation step for the two-session MRV detector (VW-91 / B04); it does not itself run any comparison.

### Fixed

- **Rep 1's concentric span no longer inflated by a pre-lift engagement artifact (WA-rep1-segmentation).** Rep 1's concentric phase routinely opened with a leading run of samples the device/adapter tags `CONCENTRIC` (nonzero directed velocity) before the athlete actually starts the lift — cable slack takeup, handle engagement, initial settling — and `completeSet()` had no mechanism to exclude it, so `getRepDuration` / `getPhaseDuration(rep.concentric)` and rep 1's ROM measured 15-35% too high relative to later reps in the same set. `completeSet()` now also re-anchors rep 1's concentric phase, dropping any leading run of samples that never travels more than 2cm (`LEADING_ARTIFACT_DISPLACEMENT_M`) from the phase's own first sample, provided that low-displacement run lasts at least 2 samples — a single real starting frame is never mistaken for a settling period, so a rep 1 with a clean start is untouched. This mirrors the same artifact voltras-mcp's `peakConcentricBaseline` works around for velocity by substituting the set's peak rep as baseline instead of trusting rep 1 — but segmentation has no "other rep" to substitute for rep 1's own span, so this corrects the phase directly. Applies at `completeSet()` time only, consistent with the existing trailing-IDLE trim; live in-progress reads of rep 1 before the set completes are unaffected.

## 2.0.0

Two changes ship in one release on purpose: both redefine what a measured value *means* — whose stream it belongs to, and what units it is in — and the consumer that has to re-read the sample contract is the same consumer that has to adopt the baseline identity. Splitting them would cost two migrations for one coherent revision of the data contract.

### Changed (BREAKING)

- **`WorkoutSample.position` is metres, not a normalised 0–1 fraction.** The field was documented as "Position in range of motion (0 = start, 1 = full extension)", but producers forwarded a device-native cable-extension figure (≈0 at rest, ~600 at full pull) unconverted — so a consumer computing ROM from `samples` and one reading a metres-valued `rom_m` disagreed about the same rep. The contract is now **cable extension in metres**, converted **at the producer's bridge**. This library performs no conversion and validates nothing at runtime: passing device-native units silently inflates every absolute output ~1000×, exactly as passing tenths-of-lbs inflates force 10×.
  - **Absolute values change:** `getPhaseRangeOfMotion`, `getRepRangeOfMotion`, `getSetMeanROM` / `getSetBestROM` / `getSetFirstRepROM` / `getSetLastRepROM` / `getSetRepROMs` / `getSetRepROMAt`, `getSetWorkingROM`, `getRepWork` / `getRepConcentricWork` / `getRepEccentricWork` / `getRepTotalWork` (now **lbs·m**), and `getRepMeanConcentricPower` / `getRepMeanEccentricPower` (now **lbs·m/s**).
  - **The lbs·m → Joules recipe (×4.448) applies to the single-phase work getters ONLY, never to `getRepTotalWork`.** That function sums two positive magnitudes rather than net displacement, so a closed cycle adds instead of cancelling: 0 → 0.6 m and back at a constant 100 lbf returns 120 lbs·m where net mechanical work is 0. Converting it produces a confident, wrong "533.76 J". It is a volume-of-effort proxy, not physics; its docstring now says so.
  - **Ratio-based analytics are scale-invariant and unchanged in value:** percent ROM decay within a set, ROM CV / outliers / distributions, `getRepROMRatio`, `isPartialRep`, `assessRepROM`, the fatigue-verdict ROM dimension, `getSetROMChange`, curve shape. They compare a rep against another rep or against a caller-supplied reference, so they only require that **both sides use the same scale**.
  - **Persisted references must be rebuilt:** any stored `TechniqueBaseline.rom`, `expectedROM` or ROM distribution collected under the old contract is now on the wrong scale and will misclassify every rep. Expectations built from live data are self-consistent and fine.
  - Impulse, velocity, force and every time-derived metric are untouched — `position` does not enter them.
- **`LoadSettings.chainsFullExtension` is a new REQUIRED field**, and `calculateFrameLoad`'s chain ramp is no longer hard-coded to a 0–1 range. The old ramp was the only place in the library that assumed the old position contract: `chainsFactor = clamp(1 − position)` collapses to 0 for any device-native position, and under metres never reaches 0 within a real rep. The ramp is now `clamp(1 − position / chainsFullExtension, 0, 1)`.
  - It is required rather than defaulted because there is no safe default, and because a default of `1` would NOT have preserved what real callers were getting. Producers fed device-native positions (~600 at full pull), so the old `clamp(1 − position)` evaluated to `0` and **the chain term never engaged at all**. Defaulting to `1` under the metres contract silently switches those callers from "no chain contribution" to a plausible-looking curve: with base 100 lb and chains 50 lb on a 0.6 m cable, that is +20 lb of phantom load at full extension and mean chain contribution overstated by 40% across the stroke. A default that changes behaviour rather than preserving it is worse than no default — plausible magnitude, plausible curve, invisible in review. A field whose docs say callers MUST set it is a required field, and a major is the moment to make it one. This is also the release's one genuinely structural break, which settles the semver question below on its own.
  - **The ramp's DIRECTION is a known open question, unchanged by this release.** The term is descending in extension. Whether that is right is genuinely undetermined, because `voltra-node-sdk` documents both answers: its README settings table and `setChains`' own "reverse resistance" naming say chains *reduce* load as you extend (agreeing with this code), while the `setInverseChains` JSDoc (`src/sdk/voltra-client.ts:693-700`, "opposite of regular chains") implies chains *add* through the concentric, which would make this code the inverse mode carried under the wrong name. Those two statements were introduced by the same SDK commit and contradict each other, and no recorded set carries a chains weight, so there is no force-vs-position trace to break the tie. The formula is deliberately untouched: flipping it moves every chains-set load and must not be done on a 50/50 reading of the docs. The tests pin current behaviour as a change-detector, explicitly not as a validated physical model. Tracked — with the full evidence list and the one hardware measurement that would resolve it — in `KNOWN-ISSUES-2026-07-27.md`.
  - Set it to the cable's real full-extension distance (~0.6 m on Voltra). Ignored when `chains === 0`, so a chainless caller is unaffected at runtime; a reference of `0` drops the chain term entirely rather than guessing a ramp.
  - `DEFAULT_LOAD_SETTINGS` is now `{ weight: 0, chains: 0, eccentric: 0, chainsFullExtension: 0 }`. The `0` is deliberate: a caller who adds chains by spreading the default (`{ ...DEFAULT_LOAD_SETTINGS, chains: 40 }`) gets **no** chain contribution — loudly wrong, and so noticed — rather than a plausible-looking ramp against a fabricated reference.
  - `DEFAULT_CHAINS_FULL_EXTENSION` is **not** exported. It existed only to name the removed default.

### Added

- **`BaselineKey` — the identity a calibration baseline belongs to.** `{ userId, exerciseId, setupId?, side? }`, exported from the root barrel with the `BaselineSide` (`'left' | 'right'`) alias and three helpers: `baselineKeyId(key)` (stable, percent-encoded storage key; omitted dimensions serialize to `*`), `matchesBaselineKey(key, filter)` (fields absent from the filter are wildcards) and `baselineKeyEquals(a, b)`.
  - `setupId` is the *physical* configuration (bench height, cable attachment, stance) — typically inferred from ROM clustering, deliberately distinct from device settings (chains / damper / eccentric), which live on `LoadSettings`.
  - `side` exists because a bilateral lift is two independent measurement streams. The side-agnostic view is **derived** by merging the two per-side distributions (`mergeDist`), not collected as a third stream, so time-to-calibrated does not double.
- The key is threaded through the **baseline and series types only**, always as an optional field — no other API sees it:
  - `VelocityBaseline.key?` and `SerializedBaseline.key?`. `buildBaseline(dataPoints, key?)` stamps it, `serializeBaseline` / `deserializeBaseline` round-trip it, `updateBaselineWithPoint` preserves it. The wire `version` stays `1` — a keyless payload still deserializes.
  - `TechniqueBaseline.key?` and `TechniqueBaselineOptions.key?` (copied verbatim by `createTechniqueBaseline`).
  - `ProcessedSession.key?`, `BuildTimeSeriesConfig.key?` (a `Partial<BaselineKey>` filter, intersected with the existing `exerciseId` filter; sessions carrying no key are excluded once a filter is supplied) and `MetricTimeSeries.key?`, which echoes the filter back.
- `BaselineKeyFilter` (`= Partial<BaselineKey>`), exported alongside `BaselineKey`, so the public `key` fields that SELECT streams (`BuildTimeSeriesConfig.key`, `MetricTimeSeries.key`) are typed distinctly from the ones that IDENTIFY a stream (`VelocityBaseline.key`, `TechniqueBaseline.key`, `ProcessedSession.key`).
- **Schema migration `002_position_metres.sql` — a position-scale boundary MARKER for WA's own store.** It rewrites nothing. Applying it raises the store's `latestAppliedVersion` to `2`, so every row written from then on carries `schema_version = 2`; rows already present keep `1`. A `reps` row at `schema_version = 1` holds positions on the unspecified pre-2.0.0 scale, `>= 2` holds metres. `PRAGMA user_version` mirrors the boundary at the SQLite level. See `docs/architecture/storage.md`.

### Notes

- `time-series.ts`'s `ProcessedSession` / `ProcessedSet` are a *different level of aggregation* from the sample-based `Set` model, not a competing duplicate of it — the file already documented that split. What they genuinely lacked was any notion of whose measurement stream they described; `key` supplies it, which is why the change lands there rather than in a collapse of the two shapes.
- No stored data is converted and no conversion was added to this library. Units are the producer's responsibility at the bridge; WA's job is to state the contract and not assume the old one.
  - That is unqualifiedly true of **consumers'** stores, which WA never touches. It is NOT the whole story for **WA's own** persistence layer (`@voltras/workout-analytics/store`), which serializes sample streams verbatim into `reps.raw_samples_json` — so a database written by 1.7.0 and read by 2.0.0 holds positions on both scales in one table, indistinguishable without a marker, and `getRepRangeOfMotion` over a mixed set is silently ~1000× wrong for the old half.
  - WA still does not convert that data: the old scale was device-dependent and was never recorded alongside it, so there is no factor to convert by and inferring one would corrupt rows while reporting success. Migration `002` records the boundary instead (above). Consumers of the store must not compare absolute ROM / work / power across it, and must rebuild any ROM baseline derived from `schema_version = 1` rows.
- **The `SerializedBaseline` wire format stays at `version: 1`, and the DOWNGRADE path is lossy.** A 2.0.0-written payload carrying `key` deserializes cleanly under 1.7.0 — but 1.7.0 does not know the field, so the identity is silently dropped and the baseline reverts to "belongs to whoever the caller thinks". Holding at version 1 is still the right call (a bump would break forward-reads for no gain), but it is not free: a consumer that downgrades must treat every stored baseline as unkeyed.
- Semver: `2.0.0` on both readings. Structurally, `LoadSettings.chainsFullExtension` is a new required field, so any caller constructing a `LoadSettings` fails to compile. Semantically — the more important half — the *meaning* of `WorkoutSample.position` changed while every signature stayed compatible, so a consumer who upgrades without touching its bridge gets silently wrong absolute numbers. That is exactly what a major exists to force a look at.

## 1.7.0

### Added

- **Live fatigue verdict** — new pure module `src/analytics/fatigue-verdict.ts`. `getSetFatigueVerdict(set, schemes?)` returns a single aggregated state on a spectrum (Good → Slowing → Grinding → Form breaking down) plus three per-dimension status lights (velocity-loss · ROM-breakdown · tempo-breakdown), each `ok | warn | alarm`.
  - Aggregation is **strict precedence, not worst-of-three with velocity dominant**: a *cheat rep* props velocity up by cutting ROM and dropping the eccentric, so a ROM or tempo alarm overrides a healthy-looking velocity into "form breaking down".
  - One call serves both the LIVE framing (in-progress set, reference is best-so-far) and REVIEW (completed set), because the reused primitives already use best/peak references rather than first-rep.
- `getSetWorkingROM(set)` — the trimmed ROM standard: peak of the ESTABLISHED reps, dropping rep 1 (setup) and the last rep (in-progress or truncated at set close). Returns `null` below 3 reps or when no middle rep has positive ROM, so the ROM dimension raises nothing rather than judging against a fabricated standard. Contrast `getSetBestROM`, the naive max over all reps.
- Per-dimension resolvers `velocityLossTone`, `romBreakdownTone`, `tempoBreakdownTone`, their default breakpoint schemes (`DEFAULT_ROM_BREAKDOWN_SCHEME`, `DEFAULT_ECCENTRIC_BREAKDOWN_SCHEME`, `DEFAULT_CONCENTRIC_GRIND_SCHEME`), and the types `DimensionTone`, `FatigueVerdictState`, `FatigueVerdict`, `FatigueVerdictSchemes`.

### Notes

- Additive only — no existing signature or behaviour changed. The module composes existing WA primitives and does not modify them.
- Trim policy (first + last) and peak-vs-median remain open calibration knobs.

## 1.6.0

### Added

- **WA owns VBT velocity-zone thresholds** — new module `src/vbt/zones.ts` (WA-02.04). `getVelocityZones(opts?)` resolves mean-concentric-velocity zone bands in priority order: profile-derived (individualized — boundaries anchored at fixed %1RM cut-points `[0.90, 0.80, 0.65, 0.50] × estimated1RM`, mapped through the user's `LoadVelocityProfile` via `predictVelocity`, floored at `profile.mvt`, capped at V0 = `profile.intercept`; used when `confidence !== 'low'`) → per-movement-class absolute defaults (`compound` / `cable` / `isolation` / `ballistic`, 5 literature-anchored bands) → global compound default. Every result is tagged with its `source` and a `basis`. New exports: `getVelocityZones`, `categorizeVelocity` (now zones-aware), and types `VelocityZoneId`, `VelocityZones`, `VelocityZoneBand`, `MovementClass`, `GetVelocityZonesOptions`.
- All zone bands are **MEAN concentric velocity** semantics (WA-D02), documented in TSDoc. New null-safe view-model helper `getSetRepMeanVelocities(set)` — the mean-velocity sibling of `getSetRepPeakVelocities`, the correct feed for zone classification and the velocity-loss reference (peak must not be fed to a mean-velocity scale).
- `cable` / `isolation` default bands are a documented **placeholder** (shifted down ~0.10–0.15 m/s) pending calibration against real Voltra session data, matching the posture of the placeholder RIR coefficients.

### Changed

- **Velocity-loss reference: first rep → running-best rep (behavior change, WA-02.05 / WA-D01).** `getSetVelocityLossPct` now computes `((VBest − VLast) / VBest) × 100` against the set's fastest (best) mean-velocity rep instead of the first rep. On a clean monotonic set (rep 1 is fastest) the value is **identical** to before; on slow-start / ramp / engagement-artifact sets — common on cable hardware — it correctly reports the deeper loss the first-rep reference understated. VL is now **≥ 0 by construction** — the old negative "sped up past the last rep" branch can no longer occur (a set that speeds up to its end reports 0, not a negative loss).
- `estimatePerRepRIR` now anchors per-rep decay at the set's best rep (`vBest = max(velocities)`, per-rep drop `max(0, (vBest − v_i) / vBest)`) instead of `velocities[0]`, consistent with the set-level change. Monotonic sets are unchanged.
- **Widened taxonomy:** `categorizeVelocity(velocity, zones?)` keeps its back-compatible single-argument call (defaulting to the global compound zones) but now returns the 5-zone `VelocityZoneId` (`grinding` / `maximalStrength` / `strengthSpeed` / `power` / `speed`) instead of the legacy 4-way `'fast' | 'moderate' | 'slow' | 'grinding'`. The legacy `VelocityZone` type is retained as `@deprecated` for API-superset compatibility.

### Notes

- Downstream fatigue consumers (`estimateSetRIR`, `computeVBTSetFatigueIndex`, `isSetFatigued`, `getSetFatigueSummary`) inherit the new reference and shift **conservatively** — reported VL rises slightly, RIR drops slightly, fatigue index rises slightly, **only on non-monotonic sets** (identical on clean sets). No API signatures changed. Existing test expectations were unchanged because all fixtures are monotonic (best == first); new non-monotonic regression tests were added.
- `rir-exercise-specific.ts` coefficients take `velLossPct` as a caller-supplied **input** (they do not call `getSetVelocityLossPct` internally), so they are not silently retuned by this change; a caller that now passes best-anchored VL gets the documented conservative shift. The coefficients are already flagged as placeholders pending calibration — no retune performed.

## 1.4.1

### Fixed

- `getRepRangeOfMotion` now returns the concentric **displacement traversed** (`|endPosition − startPosition|`, via `getPhaseRangeOfMotion(concentric)`) instead of the absolute `concentric.endPosition`. The absolute value over-reported ROM by the concentric start offset for any rep not beginning at position 0 (partial reps, positional drift, non-zero rest), inflating every downstream ROM consumer — set-level ROM, ROM change/CoV/outliers, the fatigue `romRatio`, and partial-rep / stimulus scoring. "Range of motion" is a span, not a coordinate. Values are unchanged for reps that start at 0. (WA-02.03)

## 1.1.0

### Added

- New subpath: `@voltras/workout-analytics/store/sqlite-expo` — Expo / React Native SQLite driver via the `expo-sqlite@^15` peer.
  - Factory: `createSqliteExpoStore({ path })` mirrors the Node factory's open / pragmas / migrations sequence.
  - Concurrency: the driver wraps an internal Promise mutex so concurrent transactions serialize without a BEGIN-BEGIN race (v5R-1 / AC-32). Unlike `better-sqlite3`'s synchronous `db.transaction`, `expo-sqlite` is async-throughout, so this serialization is enforced in JS.
  - Verification: the driver type-resolves at build time and is exercised by the package's shared store conformance suite (`runStoreTests`) on Expo SDK 54+ targets. Plain Node CI skips the runtime suite — `expo-sqlite` is a React Native native module. Functional verification on devices/simulators is owned by `voltras/mobile`.

### Fixed

- SDK 0.6.0 contract tightening:
  - Velocity aggregation in `phase.ts:addSampleToPhase` now normalizes input via `Math.abs`, hardening the documented magnitude-only contract on `WorkoutSample.velocity`. Eccentric peaks no longer silently zero if a buggy adapter forwards SDK 0.6.0's signed `int16` velocity.
  - Tightened JSDoc on `WorkoutSample.force`/`velocity`, `getRepImpulse`, `getRepWork`, `getRepMeanConcentricPower` to call out the lbs unit unambiguously and document the silent 10× inflation hazard if an adapter forwards device tenths-of-lbs without dividing.
  - Adapter relocation, `DeviceAssertedSet`, and `repDurationMs` integration are deferred to 2.0.0.

### Notes

- `package.json#exports` now has 5 subpath keys (`.`, `./schema`, `./store`, `./store/sqlite-node`, `./store/sqlite-expo`).
- No changes to `peerDependencies` — `expo-sqlite@^15` was already declared as an optional peer in 1.0.0.

## 1.0.0

### Breaking

- **ESM-only.** The CJS dual-emit build has been dropped. `package.json#type` is now `"module"`; only `dist/esm/` and `dist/types/` ship. Consumers on CJS must use `await import('@voltras/workout-analytics')` or migrate to ESM.

### Added

- New subpath exports for the storage layer separation:
  - `@voltras/workout-analytics/schema` — schema types and validators (zod-backed).
  - `@voltras/workout-analytics/store` — `SessionStore` interface, `StoreError`, in-memory store.
  - `@voltras/workout-analytics/store/sqlite-node` — Node SQLite driver, backed by `better-sqlite3`.
- `peerDependencies`: `better-sqlite3@^11` and `expo-sqlite@^15`, both flagged `optional: true` via `peerDependenciesMeta`. Consumers install only the driver they need.
- `zod` added as a runtime dependency.

### Notes

- `@voltras/workout-analytics/store/sqlite-expo` is **not** shipped in 1.0.0; it follows in 1.1.x once the Expo driver source lands.
