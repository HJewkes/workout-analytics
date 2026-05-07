# Code map

File-by-file guide to `src/`. Citations use `path:line` format.

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
| Models | `src/index.ts:9-64` | Types + functions from `src/models/`. |
| Stats — distribution | `src/index.ts:67-81` | `StreamingDistribution`, mean/var/std/z/CV. |
| Stats — schemes | `src/index.ts:84-96` | `BreakpointScheme`, `InterpolationScheme`, defaults. |
| Analytics — types | `src/index.ts:99-114` | `Expectation`, `TechniqueBaseline`, comparison helpers. |
| Analytics — rep | `src/index.ts:117-135` | Force/velocity/timing/impulse/work/power per rep. |
| Analytics — set | `src/index.ts:138-160` | Velocity loss, ROM, eccentric velocity, summary. |
| Analytics — quality | `src/index.ts:163-179` | ROM/eccentric/velocity assessment. |
| Analytics — fatigue | `src/index.ts:182-207` | RIR, fatigue index, consistency, outliers. |
| Analytics — intensity | `src/index.ts:210-215` | Per-rep RIR, hardness, intensity / stimulus. |
| Analytics — session | `src/index.ts:218-227` | Strength estimate, readiness, session fatigue, volume. |
| VBT | `src/index.ts:230-269` | Constants, profile, baseline, e1RM, coverage, advanced fitting. |
| Exercises | `src/index.ts:272-290` | Types + catalog functions. |

## `src/models/`

Data primitives. All hardware-agnostic.

| File | Responsibility |
| --- | --- |
| `src/models/types.ts` | `MovementPhase` enum (`IDLE=0, CONCENTRIC=1, HOLD=2, ECCENTRIC=3`) at `src/models/types.ts:8-13`; `PhaseNames` for UI display at `:18-23`. |
| `src/models/sample.ts` | `WorkoutSample` interface at `src/models/sample.ts:10-53`. Strict unit contract: `velocity` is magnitude-only (m/s, non-negative), `force` is lbs (NOT tenths-lbs). Optional `load`. |
| `src/models/phase.ts` | `Phase` interface at `:15-35`; `EMPTY_PHASE` at `:41-55`; `addSampleToPhase` at `:61-91` (defensive `Math.abs` on velocity at `:74`); derived helpers at `:102-135`. |
| `src/models/rep.ts` | `Rep` at `:24-28`; `createRep` at `:33-39`; `addSampleToRep` at `:52-65` (routes by phase + eccentric-state); `getRepTempo` at `:75-82`; derived helpers at `:84-110`. |
| `src/models/set.ts` | `Set` at `:30-34`; `createSet` at `:39-41`; `addSampleToSet` at `:47-65` (rep boundary on eccentric→concentric); `completeSet` at `:94-104` (trims trailing IDLE); `trimTrailingIdle` at `:70-88`; load helpers at `:140-174`. |
| `src/models/load.ts` | `LoadSettings` (weight, chains, eccentric) at `:24-31`; `calculateFrameLoad` at `:70-89` (linear chains decay, eccentric % adjustment); `getEffectiveLoad` at `:109-111` (returns base weight). |
| `src/models/tempo.ts` | `TempoParts` at `:11-16`; `formatTempo` (`E-HT-C-HB`) at `:19-21`; `parseTempo` at `:24-28`. |
| `src/models/index.ts` | Barrel for the models module. |

## `src/stats/`

Distribution + classification primitives.

| File | Responsibility |
| --- | --- |
| `src/stats/distribution.ts` | `StreamingDistribution` (Welford) at `:12-23`; `addSample` at `:48-64`; `mergeDist` (parallel variance) at `:70-93`; `getMean`/`Variance`/`StdDev`/`ZScore`/`CV` at `:99-139`; `isOutlier`/`isWithinRange` at `:145-163`; `buildDistribution` at `:169-171`. |
| `src/stats/schemes.ts` | `BreakpointScheme<T>` at `:29-32`; `InterpolationScheme` at `:49-51`; `classifyByBreakpoints` at `:62-69`; `interpolate` at `:77-111`; factories at `:120-139`; defaults at `:158-224` (`DEFAULT_RIR_SCHEME`, `DEFAULT_CONSISTENCY_SCHEME`, `DEFAULT_OUTLIER_SCHEME`, `DEFAULT_QUALITY_SCHEME`, `DEFAULT_CONFIDENCE_SCHEME`). |
| `src/stats/index.ts` | Barrel. |

## `src/analytics/`

Stateless analytics over `Rep` / `Set`.

| File | Responsibility |
| --- | --- |
| `src/analytics/types.ts` | `Expectation<T>` (fixed or distribution) at `:24-26`; `ComparisonResult` at `:31-40`; `ChangeResult` at `:46-57`; `TechniqueBaseline` at `:63-72`; factories + `compareToExpectation` at `:81-178`. |
| `src/analytics/rep-analytics.ts` | Eccentric velocity at `:19-21`; force getters at `:31-57`; concentric/eccentric time at `:67-77`; impulse at `:95-117` (trapezoidal, lbs·s); work at `:135-157` (trapezoidal, lbs·position-units); total/concentric/eccentric variants at `:162-229`; mean power at `:244-258`. **Unit warnings on `:88-94`, `:122-133`, `:236-243`.** |
| `src/analytics/set-analytics.ts` | First/last/best/mean/peak velocity at `:20-83`; eccentric velocity at `:93-138`; ROM helpers at `:148-189`; per-rep accessors at `:199-213`; `SetVelocitySummary` at `:222-245`. |
| `src/analytics/quality.ts` | `RepQualityFlags` at `:32-41`; `QualitySchemes` at `:46-55`; partial-rep + rushed-eccentric defaults at `:60-71`; `assessRep*` at `:80-111`; `getRepQualityFlags` at `:120-150`; convenience boolean checks at `:159-198`; `assessRepQuality` at `:217-233`. |
| `src/analytics/fatigue.ts` | `FatigueSchemes`/`FatigueIndex`/`ConsistencyScore`/`RIREstimate`/`OutlierRep` types at `:46-109`; change analytics (velocity/tempo/ROM/eccentric-velocity) at `:118-164`; `EccentricControl` at `:173-180` and score/warning at `:191-229`; `DEFAULT_FATIGUE_WEIGHTS` at `:239-243`; `getSetFatigueIndex` at `:253-294`; consistency at `:310-352`; `findOutlierReps` at `:361-415`; `estimateSetRIR` at `:424-447`; `isSetFatigued` + `getSetFatigueSummary` at `:456-495`. |
| `src/analytics/intensity.ts` | Default decay rate `0.4` at `:24`; `estimatePerRepRIR` (velocity-proportional) at `:50-87`; `getRepHardnessWeight` (`e^(-k*rir)`) at `:107-110`; `getSetIntensityScore` at `:127-135`; `getSetStimulusScore` (composite) at `:164-212`. |
| `src/analytics/session.ts` | Type definitions at `:27-60`; `computeStrengthEstimate` (best of profile / reps / hybrid) at `:78-126`; `computeReadiness` (green/yellow/red zones) at `:143-168`; `computeSessionFatigue` (cross-set, junk-volume detection) at `:187-237`; `computeVolume` at `:250-257`; `computeEffectiveVolume` at `:273-291`. |
| `src/analytics/index.ts` | Barrel. |

## `src/vbt/`

Velocity-based training surface.

| File | Responsibility |
| --- | --- |
| `src/vbt/constants.ts` | `VELOCITY_AT_PERCENT_1RM` table (Gonzalez-Badillo) at `:28-42`; `DEFAULT_MVT = 0.17` m/s at `:51`; `DEFAULT_VELOCITY_RIR_MAP` at `:61-69`; `estimatePercent1RMFromVelocity` at `:89-113`; `categorizeVelocity` (zones) at `:127-132`. |
| `src/vbt/profile.ts` | `LoadVelocityDataPoint` at `:22-29`; `LoadVelocityProfile` at `:37-45`; `olsRegression` (internal) at `:61-111`; `buildProfile` at `:131-170`; `predictVelocity` at `:179-182`; `estimateLoad` at `:191-195`; `addDataPoint` at `:205-210`. |
| `src/vbt/baseline.ts` | `VelocityBaseline` at `:19-21`; `buildBaseline` (sorted by load) at `:37-40`; `getExpectedVelocity` (linear interpolation, returns null out-of-range) at `:53-88`. |
| `src/vbt/e1rm.ts` | `E1RMEstimate` at `:20-27`; `estimateE1RMFromProfile` (solves for MVT) at `:47-67`; `estimateE1RMFromReps` (Epley) at `:90-119`; `estimateHybridE1RM` (confidence-weighted blend) at `:138-168`. |
| `src/vbt/coverage.ts` | `CoverageBin` at `:21-28`; `CoverageResult` at `:33-40`; `computeCoverage` (bins by %e1RM with optional staleness) at `:56-120`; `identifyCoverageGaps` at `:132-137`. |
| `src/vbt/profile-fitting.ts` | `FittingOptions` at `:20-35`; `FittingResult` at `:40-46`; weighted least squares at `:56-89`; weighted R² at `:94-121`; uncertainty at `:126-164`; Huber weight at `:170-174`; `fitLVProfile` (recency + quality + Huber IRLS + age filter) at `:194-314`. |
| `src/vbt/index.ts` | Barrel. |

## `src/exercises/`

| File | Responsibility |
| --- | --- |
| `src/exercises/types.ts` | `MuscleGroupId` (18 values) at `:12-30`; `MovementPatternId` (8 values) at `:36-44`; `EquipmentCategory` (8 values) at `:50-58`; `EquipmentInfo` at `:60-63`; `CableSetup` at `:69-74`; `Exercise` at `:80-117`. |
| `src/exercises/catalog.ts` | Internal storage + 4 indexes (id, muscle, movement, equipment) at `:22-29`; `buildIndexes` at `:30-60`; `setCatalog` at `:70-74`; `loadCatalog` (dynamic import of `./data/catalog.json`) at `:80-92`; lookups at `:101-172`. |
| `src/exercises/data/catalog.json` | Generated catalog data file. Populated by the `npm run exercises:pipeline` scripts under `scripts/`. |
| `src/exercises/index.ts` | Barrel. |

## `src/schema/`

Storage record types + zod validators + migration registry.

| File | Responsibility |
| --- | --- |
| `src/schema/types.ts` | `Session` at `:10-23`; `SetRecord` at `:25-33`; `RepRecord` at `:35-47` (`rawSamplesJson` is opaque string). |
| `src/schema/validators.ts` | `sessionSchema` / `setRecordSchema` / `repRecordSchema` zod schemas at `:13-38`. **D19 invariant**: NO `.default()`, `.transform()`, or `.coerce()` — round-trip must not silently mutate (`:1-9`). |
| `src/schema/_generated.ts` | Generated by `scripts/migrations-build.mjs`. Embeds migration SQL + SHA-256. Source of truth for `MIGRATIONS`. |
| `src/schema/migrations/index.ts` | `Migration` interface at `:11-15`; `MIGRATIONS` array at `:17-19` (currently 1 entry: v1 from `_generated.ts`). |
| `src/schema/migrations/001_initial.sql` | DDL: `sessions`, `sets`, `reps` with FK CASCADE relationships and indexes on `started_at`, `session_id`, `set_id`. |
| `src/schema/index.ts` | Barrel for the `/schema` subpath. |

## `src/store/`

Driver-agnostic storage primitives plus the two SQLite drivers.

| File | Responsibility |
| --- | --- |
| `src/store/session-store.ts` | `SessionStore` interface at `:19-101`. Writes: `saveSession`, `saveSet`, `saveReps`. Reads: `getSession`, `getSetsBySession`, `getRepsBySet`, `getRecent`. Lifecycle: `close` (idempotent). Documented invariants: empty `saveReps([])` is no-op (v5R-3); duplicate-id throws `StoreError('duplicate id: <id>')`; reads return `undefined`/`[]` for missing rows (D16); `close()` is idempotent. |
| `src/store/errors.ts` | `StoreError`, `MigrationError`, `ValidationError` at `:12-31`. All accept `{ cause }`. |
| `src/store/with-transaction.ts` | `SyncTransactionalDriver` at `:20-22`; `AsyncTransactionalDriver` at `:24-28`; `withTransaction` at `:36-57`. Discriminates on literal `'transaction' in driver`. |
| `src/store/migration-runner.ts` | `MigrationDriverSql` at `:39-51`; `MigrationDriver` at `:53`; bootstrap SQL at `:55-60`; SHA-256 helper at `:66-68`; `validateSequence` at `:70-82`; `MigrationRunner` class at `:84-151` (run order: validate → bootstrap → applied set → apply unapplied with hash check inside transaction). |
| `src/store/prepare-for-save.ts` | `prepareForSave` at `:22-37`. Validates with zod, shallow-copies, overwrites `schemaVersion` with `latestAppliedVersion`. Wraps `ZodError` as `ValidationError`. |
| `src/store/bootstrap.ts` | `applyConnectionPragmas` at `:30-38`. Issues `PRAGMA foreign_keys = ON` then `PRAGMA journal_mode = WAL`, reads back to verify WAL (`v5R-9`). Throws `StoreError('failed to enable WAL: ...')` if WAL unavailable. |
| `src/store/store.shared.ts` | Test-harness conformance suite (`runStoreTests`). Imports `vitest` — intentionally not re-exported from `src/store/index.ts`. Driver tests import directly. |
| `src/store/index.ts` | Barrel for the `/store` subpath. |
| `src/store/sqlite-node/index.ts` | `createSqliteNodeStore` factory at `:141-300`. Open path: resolve `better-sqlite3` peer → open db → wrap in `BetterSqlite3Driver` → `applyConnectionPragmas` → `MigrationRunner.run` → derive `latestAppliedVersion` → return `SessionStore`. |
| `src/store/sqlite-node/driver.ts` | `BetterSqlite3Driver` class at `:56-111`. Synchronous driver wrapping a promise-mutex (`chain`) for serialization (`:88-110`). DEVIATION from v5R-1: issues BEGIN/COMMIT manually because `db.transaction(fn)` rejects async callbacks (`:14-28`). |
| `src/store/sqlite-node/require-peer.ts` | `createRequirePeerResolver` for resolving the optional `better-sqlite3` peer via `createRequire(import.meta.url)`. |
| `src/store/sqlite-expo/index.ts` | `createSqliteExpoStore` factory at `:122-282`. Mirrors the Node factory but async-throughout. |
| `src/store/sqlite-expo/driver.ts` | `ExpoSqliteDriver` class implementing `MigrationDriverSql` + `AsyncTransactionalDriver` at `:36+`. Uses an internal Promise mutex (`currentTx`) to serialize `BEGIN EXCLUSIVE` (v5R-1 / AC-32). |

## Tests

| Location | Coverage |
| --- | --- |
| `src/__tests__/models/` | `phase.test.ts`, `rep.test.ts`, `set.test.ts` — boundary detection, `Math.abs` defensive normalization, trim-trailing-idle. |
| `src/__tests__/store/` | `bootstrap.test.ts`, `migration-runner.test.ts`, `migrations-conformance.test.ts`, `validators.test.ts`, `with-transaction.test.ts`, `sqlite-node.test.ts`, `sqlite-expo.test.ts`, `run-store-tests.smoke.test.ts`. The `sqlite-expo.test.ts` skips on plain Node CI (native module unavailable). |
| `src/analytics/*.test.ts` | Co-located unit tests for fatigue, quality, intensity, rep-analytics, set-analytics, session. |
| `src/vbt/*.test.ts` | Co-located unit tests for constants, profile, baseline, e1rm, coverage, profile-fitting. |
| `src/stats/*.test.ts` | Distribution + schemes. |

Vitest config: `vitest.config.ts` (one project for `src/**/*.test.ts`).

## Scripts

`scripts/` contains the exercise data pipeline (`exercises:analyze`, `exercises:collect`, `exercises:process`, `exercises:export`, `exercises:research`) and `migrations-build.mjs` which generates `src/schema/_generated.ts` from the SQL files in `src/schema/migrations/`. Run via `npm run` scripts in `package.json:46-56`.
