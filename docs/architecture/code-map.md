# Code map

File-by-file guide to `src/`. Citations name the file and the function, type or constant, never a line number: line ranges go stale on every edit. `npm run check:docs` (part of `npm run lint`) fails on a line-number citation anywhere under `docs/`.

## Table of contents

- [`src/index.ts`](#srcindexts)
- [`src/models/`](#srcmodels)
- [`src/stats/`](#srcstats)
- [`src/analytics/`](#srcanalytics)
- [`src/vbt/`](#srcvbt)
- [`src/exercises/`](#srcexercises)
- [`src/schema/`](#srcschema)
- [`src/store/`](#srcstore)
- [Tests](#tests)

## `src/index.ts`

Public barrel for the default subpath (`@voltras/workout-analytics`). Re-exports models, stats, analytics, VBT, and exercises. Storage subpaths are NOT re-exported here — they live behind their own `package.json#exports` keys.

| Section | Lines | Exports |
| --- | --- | --- |
| Models | `src/index.ts` | Types + functions from `src/models/`. |
| Stats — distribution | `src/index.ts` | `StreamingDistribution`, mean/var/std/z/CV. |
| Stats — schemes | `src/index.ts` | `BreakpointScheme`, `InterpolationScheme`, defaults. |
| Analytics — types | `src/index.ts` | `Expectation`, `TechniqueBaseline`, comparison helpers. |
| Analytics — rep | `src/index.ts` | Force/velocity/timing/impulse/work/power per rep. |
| Analytics — set | `src/index.ts` | Velocity loss, ROM, eccentric velocity, summary. |
| Analytics — quality | `src/index.ts` | ROM/eccentric/velocity assessment. |
| Analytics — fatigue | `src/index.ts` | RIR, fatigue index, consistency, outliers. |
| Analytics — intensity | `src/index.ts` | Per-rep RIR, hardness, intensity / stimulus. |
| Analytics — session | `src/index.ts` | Strength estimate, readiness, session fatigue, volume. |
| VBT | `src/index.ts` | Constants, profile, baseline, e1RM, coverage, advanced fitting. |
| Exercises | `src/index.ts` | Types + catalog functions. |

## `src/models/`

Data primitives. All hardware-agnostic.

| File | Responsibility |
| --- | --- |
| `src/models/types.ts` | `MovementPhase` enum (`IDLE=0, CONCENTRIC=1, HOLD=2, ECCENTRIC=3`); `PhaseNames` for UI display. |
| `src/models/sample.ts` | `WorkoutSample` interface. Strict unit contract: `velocity` is magnitude-only (m/s, non-negative), `force` is lbs (NOT tenths-lbs). Optional `load`. |
| `src/models/phase.ts` | `Phase` interface; `EMPTY_PHASE`; `addSampleToPhase` (defensive `Math.abs` on velocity); derived helpers. |
| `src/models/rep.ts` | `Rep`; `createRep`; `addSampleToRep` (routes by phase + eccentric-state); `getRepTempo`; derived helpers. |
| `src/models/set.ts` | `Set`; `createSet`; `addSampleToSet` (rep boundary on eccentric→concentric); `completeSet` (trims trailing IDLE); `trimTrailingIdle`; load helpers. |
| `src/models/load.ts` | `LoadSettings` (weight, chains, eccentric, **required** `chainsFullExtension`); `calculateFrameLoad` (chains ramp `clamp(1 - position / chainsFullExtension, 0, 1)`, eccentric % adjustment); `getEffectiveLoad` (returns base weight). **Chains ramp direction is unresolved — see data-model.md and KNOWN-ISSUES-2026-07-27.md.** |
| `src/models/tempo.ts` | `TempoParts`; `formatTempo` (`E-PB-C-PT`); `parseTempo`. |
| `src/models/index.ts` | Barrel for the models module. |

## `src/stats/`

Distribution + classification primitives.

| File | Responsibility |
| --- | --- |
| `src/stats/distribution.ts` | `StreamingDistribution` (Welford); `addSample`; `mergeDist` (parallel variance); `getMean`/`Variance`/`StdDev`/`ZScore`/`CV`; `isOutlier`/`isWithinRange`; `buildDistribution`. |
| `src/stats/schemes.ts` | `BreakpointScheme<T>`; `InterpolationScheme`; `classifyByBreakpoints`; `interpolate`; factories `createBreakpointScheme` / `createInterpolationScheme`; defaults (`DEFAULT_RIR_SCHEME`, `DEFAULT_CONSISTENCY_SCHEME`, `DEFAULT_OUTLIER_SCHEME`, `DEFAULT_QUALITY_SCHEME`, `DEFAULT_CONFIDENCE_SCHEME`). |
| `src/stats/grubbs.ts` | Grubbs' test for a single outlier. `GRUBBS_DEFAULT_ALPHA = 0.05`; `maxAbsZScore` (Samuelson's bound `(n-1)/√n`); `studentTTwoSidedTail` (closed-form t for integer d.f., A&S 26.7.3/26.7.4); `grubbsCriticalValue` (NIST/SEMATECH §1.3.5.17); `isGrubbsOutlier` (sole home of the `G > G_crit` comparison — boundary is exclusive and only testable here). Used by `findOutlierReps`, where a fixed z cut is unreachable for n ≤ 5. |
| `src/stats/index.ts` | Barrel. |

## `src/analytics/`

Stateless analytics over `Rep` / `Set`.

| File | Responsibility |
| --- | --- |
| `src/analytics/types.ts` | `Expectation<T>` (fixed or distribution); `ComparisonResult`; `ChangeResult`; `TechniqueBaseline`; factories + `compareToExpectation`. |
| `src/analytics/rep-analytics.ts` | Eccentric velocity; force getters; concentric/eccentric time; impulse (trapezoidal, lbs·s); work (trapezoidal, **lbs·m**); total/concentric/eccentric variants (`getRepTotalWork` sums MAGNITUDES — not net work, not Joule-convertible); mean power (**lbs·m/s**). **Unit warnings in the docstrings of `getRepImpulse`, `getRepWork` and `getRepMeanConcentricPower`.** |
| `src/analytics/set-analytics.ts` | First/last/best/mean/peak velocity; eccentric velocity; ROM helpers; per-rep accessors; `SetVelocitySummary`. |
| `src/analytics/quality.ts` | `RepQualityFlags`; `QualitySchemes`; partial-rep + rushed-eccentric defaults; `assessRep*`; `getRepQualityFlags`; convenience boolean checks; `assessRepQuality`. |
| `src/analytics/fatigue.ts` | `FatigueSchemes`/`FatigueIndex`/`ConsistencyScore`/`RIREstimate`/`OutlierRep` types; change analytics (velocity/tempo/ROM/eccentric-velocity); `EccentricControl` and score/warning; `DEFAULT_FATIGUE_WEIGHTS`; `getSetFatigueIndex`; consistency; `findOutlierReps` (Grubbs' test, at most one rep per metric); `estimateSetRIR`; `isSetFatigued` + `getSetFatigueSummary`. |
| `src/analytics/intensity.ts` | `DEFAULT_DECAY_RATE` (`0.4`); `estimatePerRepRIR` (velocity-proportional); `getRepHardnessWeight` (`e^(-k*rir)`); `getSetIntensityScore`; `getSetStimulusScore` (composite). |
| `src/analytics/session.ts` | `StrengthEstimate`, `ReadinessEstimate`, `SessionFatigueEstimate` types; `computeStrengthEstimate` (best rep set by e1RM × confidence among sets within 85% of the top e1RM, hybrid with a profile when one is given); `computeReadiness` (green/yellow/red zones); `computeSessionFatigue` (cross-set, junk-volume detection); `computeVolume`; `computeEffectiveVolume`. |
| `src/analytics/view-model.ts` | View-model seam — exact, unrounded derived metrics for rendering (dashboard/mobile). `estimateSetRpe`; `velocityLossVerdict` (canonical productive/threshold/stop banding, VL20/VL30 — the SSOT consumers must use); `getSetRepMeanVelocities`/`getSetRepPeakVelocities`; `getSetTempoSeconds` (canonical tempo tuple); `bestE1RMAcrossSets`; `weightDeviationRatio`; `classifyWeeklyVolume`. Returns `null` on no-signal; no rounding/unit-conversion/text crosses this boundary. (Full `/view` subpath + import lint = VW-64.) |
| `src/analytics/coverage.ts` | Autoregulation-explorer set bins (distinct from `vbt/coverage.ts`'s %e1RM bins): `SetSummary` / `CoverageBin`; `buildCoverageMap`; `detectStaleBins`. |
| `src/analytics/readiness-adjustments.ts` | `ReadinessAdjustments` / `ReadinessAdjustmentInputs`; `computeReadinessAdjustments` (readiness → load/volume/rest modifiers). |
| `src/analytics/state-space-strength.ts` | `StateSpaceStrengthModel` (Kalman-style latent "strength today"); noise/diffuse defaults (`DEFAULT_PROCESS_NOISE_LEVEL`, `DEFAULT_PROCESS_NOISE_TREND`, `DEFAULT_OBSERVATION_NOISE`, `DEFAULT_DIFFUSE_VARIANCE`); `StrengthState`. |
| `src/analytics/time-series.ts` | Metric time-series builders: `MetricTimeSeries` / `MetricKey`; weekly summaries + per-muscle volume aggregation over processed sessions/sets. |
| `src/analytics/trend.ts` | `analyzeTrend` (slope/direction) and `detectPlateau` over a `TimeSeries`. The flat threshold is per-metric (`FLAT_THRESHOLD_PER_DAY`), and a metric with no stated figure gets `direction: null`. `detectPlateau` has a positional window form and a rate mode (the `PlateauRateOptions` overload) that keeps a run only when its weekly slope is under `FLATLINE_FRACTION_OF_RATE` of the expected rate. |
| `src/analytics/index.ts` | Barrel. |

## `src/vbt/`

Velocity-based training surface.

| File | Responsibility |
| --- | --- |
| `src/vbt/constants.ts` | `VELOCITY_AT_PERCENT_1RM` table (Gonzalez-Badillo); `DEFAULT_MVT = 0.17` m/s; `DEFAULT_VELOCITY_RIR_MAP`; `estimatePercent1RMFromVelocity`. (`categorizeVelocity` now lives in `zones.ts`, not here.) |
| `src/vbt/zones.ts` | WA-owned velocity zones (MEAN-concentric, WA-D02). `VelocityZoneId` (5-way canonical); `VelocityZone` (4-way, deprecated); `MovementClass`; `getVelocityZones` (profile-derived / movement-class bands; a profile is used only if confidence is not low, slope is negative and its e1RM is within `isPlausibleE1RM`); `categorizeVelocity(velocity, zones?)`. |
| `src/vbt/profile.ts` | `LoadVelocityDataPoint`; `LoadVelocityProfile`; `MAX_E1RM_TO_MAX_LOAD_RATIO` (5) and `isPlausibleE1RM` (e1RM cap relative to the heaviest load seen; both exported from `profile.ts` but not from the package index); private `olsRegression`; `buildProfile`; `predictVelocity`; `estimateLoad`; `addDataPoint`. |
| `src/vbt/expected-velocity-intra-set.ts` | Intra-set expected velocity from the first N reps: `computeExpectedFromFirstNReps` (`DEFAULT_FIRST_N_REPS = 2`); `createFirstNRepsStrategy`. |
| `src/vbt/profile-fitting-bayesian.ts` | Bayesian LV-profile fit: `BayesianLVPrior` / `BayesianLVPosterior`; `fitLVProfileBayesian` (uncertainty-preserving alternative to the WLS/Huber `profile-fitting.ts`). |
| `src/vbt/rir-exercise-specific.ts` | Exercise-type-specific RIR: `ExerciseVBTProfile`; default profiles `DEFAULT_CABLE_COMPOUND_PROFILE`, `DEFAULT_CABLE_ISOLATION_PROFILE`, `DEFAULT_FALLBACK_PROFILE`; `estimateRIRWithProfile`. |
| `src/vbt/baseline.ts` | `VelocityBaseline`; `buildBaseline` (sorted by load); `getExpectedVelocity` (linear interpolation, returns null out-of-range). |
| `src/vbt/e1rm.ts` | `E1RMEstimate`; `estimateE1RMFromProfile` (solves for MVT; e1RM 0 and confidence 0 for a non-negative / NaN slope or an e1RM above the 5x cap); `estimateE1RMFromReps` (Epley; a single is 0.5 confidence, being mostly sub-max); `estimateHybridE1RM` (confidence-weighted blend; agreeing inputs never lower confidence below the stronger one). |
| `src/vbt/coverage.ts` | `CoverageBin`; `CoverageResult`; private `countBins` (bin count with rounding slack) and `createBins` (validates `binRange`, builds bins by index); `computeCoverage` (bins by %e1RM with optional staleness); `identifyCoverageGaps`. |
| `src/vbt/profile-fitting.ts` | `FittingOptions`; `FittingResult`; private `weightedLeastSquares`, `computeWeightedRSquared` (weighted R²), `computeUncertainty` and `huberWeight`; `fitLVProfile` (recency + quality + Huber IRLS + age filter). |
| `src/vbt/index.ts` | Barrel. |

## `src/exercises/`

| File | Responsibility |
| --- | --- |
| `src/exercises/types.ts` | `MuscleGroupId` (18 values); `MovementPatternId` (8 values); `EquipmentCategory` (8 values); `EquipmentInfo`; `CableSetup`; `Exercise`. |
| `src/exercises/catalog.ts` | Internal storage + 4 indexes (id, muscle, movement, equipment); `buildIndexes`; `setCatalog`; `loadCatalog` (dynamic import of `./data/catalog.json`); lookups. |
| `src/exercises/data/catalog.json` | Generated catalog data file. Populated by the `npm run exercises:pipeline` scripts under `scripts/`. |
| `src/exercises/index.ts` | Barrel. |

## `src/schema/`

Storage record types + zod validators + migration registry.

| File | Responsibility |
| --- | --- |
| `src/schema/types.ts` | `Session`; `SetRecord`; `RepRecord` (`rawSamplesJson` is opaque string). |
| `src/schema/validators.ts` | `sessionSchema` / `setRecordSchema` / `repRecordSchema` zod schemas. **D19 invariant**: NO `.default()`, `.transform()`, or `.coerce()` — round-trip must not silently mutate. |
| `src/schema/_generated.ts` | Generated by `scripts/migrations-build.mjs`. Embeds migration SQL + SHA-256. Source of truth for `MIGRATIONS`. |
| `src/schema/migrations/index.ts` | `Migration` interface; `MIGRATIONS` array (currently 1 entry: v1 from `_generated.ts`). |
| `src/schema/migrations/001_initial.sql` | DDL: `sessions`, `sets`, `reps` with FK CASCADE relationships and indexes on `started_at`, `session_id`, `set_id`. |
| `src/schema/index.ts` | Barrel for the `/schema` subpath. |

## `src/store/`

Driver-agnostic storage primitives plus the two SQLite drivers.

| File | Responsibility |
| --- | --- |
| `src/store/session-store.ts` | `SessionStore` interface. Writes: `saveSession`, `saveSet`, `saveReps`. Reads: `getSession`, `getSetsBySession`, `getRepsBySet`, `getRecent`. Lifecycle: `close` (idempotent). Documented invariants: empty `saveReps([])` is no-op (v5R-3); duplicate-id throws `StoreError('duplicate id: <id>')`; reads return `undefined`/`[]` for missing rows (D16); `close()` is idempotent. |
| `src/store/errors.ts` | `StoreError`, `MigrationError`, `ValidationError`. All accept `{ cause }`. |
| `src/store/with-transaction.ts` | `SyncTransactionalDriver`; `AsyncTransactionalDriver`; `withTransaction`. Discriminates on literal `'transaction' in driver`. |
| `src/store/migration-runner.ts` | `MigrationDriverSql`; `MigrationDriver`; `BOOTSTRAP_SQL`; `sha256Hex`; `validateSequence`; `MigrationRunner` class (run order: validate → bootstrap → applied set → apply unapplied with hash check inside transaction). |
| `src/store/prepare-for-save.ts` | `prepareForSave`. Validates with zod, shallow-copies, overwrites `schemaVersion` with `latestAppliedVersion`. Wraps `ZodError` as `ValidationError`. |
| `src/store/bootstrap.ts` | `applyConnectionPragmas`. Issues `PRAGMA foreign_keys = ON` then `PRAGMA journal_mode = WAL`, reads back to verify WAL (`v5R-9`). Throws `StoreError('failed to enable WAL: ...')` if WAL unavailable. |
| `src/store/store.shared.ts` | Test-harness conformance suite (`runStoreTests`). Imports `vitest` — intentionally not re-exported from `src/store/index.ts`. Driver tests import directly. |
| `src/store/index.ts` | Barrel for the `/store` subpath. |
| `src/store/sqlite-node/index.ts` | `createSqliteNodeStore` factory. Open path: resolve `better-sqlite3` peer → open db → wrap in `BetterSqlite3Driver` → `applyConnectionPragmas` → `MigrationRunner.run` → derive `latestAppliedVersion` → return `SessionStore`. |
| `src/store/sqlite-node/driver.ts` | `BetterSqlite3Driver` class. Synchronous driver wrapping a promise-mutex (`chain`) for serialization. DEVIATION from v5R-1: issues BEGIN/COMMIT manually because `db.transaction(fn)` rejects async callbacks. |
| `src/store/sqlite-node/require-peer.ts` | `createRequirePeerResolver` for resolving the optional `better-sqlite3` peer via `createRequire(import.meta.url)`. |
| `src/store/sqlite-expo/index.ts` | `createSqliteExpoStore` factory. Mirrors the Node factory but async-throughout. |
| `src/store/sqlite-expo/driver.ts` | `ExpoSqliteDriver` class implementing `MigrationDriverSql` + `AsyncTransactionalDriver`. Uses an internal Promise mutex (`currentTx`) to serialize `BEGIN EXCLUSIVE` (v5R-1 / AC-32). |

## Tests

| Location | Coverage |
| --- | --- |
| `src/__tests__/models/` | `phase.test.ts`, `rep.test.ts`, `set.test.ts` — boundary detection, `Math.abs` defensive normalization, trim-trailing-idle. |
| `src/__tests__/store/` | `bootstrap.test.ts`, `migration-runner.test.ts`, `migrations-conformance.test.ts`, `validators.test.ts`, `with-transaction.test.ts`, `sqlite-node.test.ts`, `sqlite-expo.test.ts`, `run-store-tests.smoke.test.ts`. The `sqlite-expo.test.ts` skips on plain Node CI (native module unavailable). |
| `src/analytics/*.test.ts` | Co-located unit tests for fatigue, quality, intensity, rep-analytics, set-analytics, session. |
| `src/vbt/*.test.ts` | Co-located unit tests for constants, profile, baseline, e1rm, coverage, profile-fitting. |
| `src/stats/*.test.ts` | Distribution + schemes + Grubbs (verified against published t and Grubbs tables). |

Vitest config: `vitest.config.ts` (one project for `src/**/*.test.ts`).

## Scripts

`scripts/` contains the exercise data pipeline (`exercises:analyze`, `exercises:collect`, `exercises:process`, `exercises:export`, `exercises:research`) and `migrations-build.mjs` which generates `src/schema/_generated.ts` from the SQL files in `src/schema/migrations/`. Run via `npm run` scripts in `package.json` `"scripts"`.
