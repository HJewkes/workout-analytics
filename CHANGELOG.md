# Changelog

All notable changes to `@voltras/workout-analytics` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

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
