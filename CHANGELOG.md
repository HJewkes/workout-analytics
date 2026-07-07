# Changelog

All notable changes to `@voltras/workout-analytics` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
