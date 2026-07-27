# Changelog

All notable changes to `@voltras/workout-analytics` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.0

Two changes ship in one release on purpose: both redefine what a measured value *means* — whose stream it belongs to, and what units it is in — and the consumer that has to re-read the sample contract is the same consumer that has to adopt the baseline identity. Splitting them would cost two migrations for one coherent revision of the data contract.

### Changed (BREAKING)

- **`WorkoutSample.position` is metres, not a normalised 0–1 fraction.** The field was documented as "Position in range of motion (0 = start, 1 = full extension)", but producers forwarded a device-native cable-extension figure (≈0 at rest, ~600 at full pull) unconverted — so a consumer computing ROM from `samples` and one reading a metres-valued `rom_m` disagreed about the same rep. The contract is now **cable extension in metres**, converted **at the producer's bridge**. This library performs no conversion and validates nothing at runtime: passing device-native units silently inflates every absolute output ~1000×, exactly as passing tenths-of-lbs inflates force 10×.
  - **Absolute values change:** `getPhaseRangeOfMotion`, `getRepRangeOfMotion`, `getSetMeanROM` / `getSetBestROM` / `getSetFirstRepROM` / `getSetLastRepROM` / `getSetRepROMs` / `getSetRepROMAt`, `getSetWorkingROM`, `getRepWork` / `getRepConcentricWork` / `getRepEccentricWork` / `getRepTotalWork` (now **lbs·m**), and `getRepMeanConcentricPower` / `getRepMeanEccentricPower` (now **lbs·m/s**).
  - **Ratio-based analytics are scale-invariant and unchanged in value:** percent ROM decay within a set, ROM CV / outliers / distributions, `getRepROMRatio`, `isPartialRep`, `assessRepROM`, the fatigue-verdict ROM dimension, `getSetROMChange`, curve shape. They compare a rep against another rep or against a caller-supplied reference, so they only require that **both sides use the same scale**.
  - **Persisted references must be rebuilt:** any stored `TechniqueBaseline.rom`, `expectedROM` or ROM distribution collected under the old contract is now on the wrong scale and will misclassify every rep. Expectations built from live data are self-consistent and fine.
  - Impulse, velocity, force and every time-derived metric are untouched — `position` does not enter them.
- **`LoadSettings.chainsFullExtension` is a new REQUIRED field**, and `calculateFrameLoad`'s chain ramp is no longer hard-coded to a 0–1 range. The old ramp was the only place in the library that assumed the old position contract: `chainsFactor = clamp(1 − position)` collapses to 0 for any device-native position, and under metres never reaches 0 within a real rep. The ramp is now `clamp(1 − position / chainsFullExtension, 0, 1)`.
  - It is required rather than defaulted because there is no safe default. Defaulting to `1` reproduces the pre-2.0.0 curve, but on a ~0.6 m cable fed metres that leaves chains contributing 40% of their weight at full extension forever — plausible magnitude, plausible curve, invisible in review. A field whose docs say callers MUST set it is a required field, and a major is the moment to make it one. This is also the release's one genuinely structural break, which settles the semver question below on its own.
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
