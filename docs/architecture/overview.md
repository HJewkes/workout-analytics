# Overview

## Table of contents

- [Responsibility](#responsibility)
- [Package shape](#package-shape)
- [Position in the workspace](#position-in-the-workspace)
- [Design principles](#design-principles)
- [Module map](#module-map)
- [What the package does NOT do](#what-the-package-does-not-do)

## Responsibility

`@voltras/workout-analytics` is a **hardware-agnostic** TypeScript library that ingests a normalized stream of telemetry samples (`WorkoutSample`) and produces structured workout data plus analytical metrics:

- Real-time sample → rep → set assembly with automatic boundary detection.
- O(1) running aggregates (mean/peak velocity, force, load, ROM, hold time).
- VBT analytics: velocity-based RIR estimation, load-velocity profiling, e1RM, coverage tracking.
- Quality and fatigue assessment (partial reps, eccentric control, consistency, outlier reps).
- Intensity scoring (per-rep RIR derivation, hardness weighting, set/session stimulus).
- Session-level estimates (strength, readiness, cross-set fatigue, effective volume).
- A normalized exercise catalog with muscle-group / movement-pattern / equipment indexes.
- Optional persistence (Sessions / Sets / Reps) with SQLite drivers for Node and Expo.

It is intentionally device-agnostic: the input contract is `WorkoutSample`, not vendor frames. The package does not import `@voltras/node-sdk`, `expo-ble`, or any device transport.

## Package shape

- **ESM only** (since 1.0.0). `package.json#type` is `"module"`. Only `dist/esm/` and `dist/types/` ship. CJS consumers must `await import(...)` (see `../../README.md` "Breaking changes").
- **5 subpath exports** (see `package.json:9-32`):

| Subpath | Source root | Purpose |
| --- | --- | --- |
| `@voltras/workout-analytics` | `src/index.ts` | Analytics surface, models, VBT, stats, exercises catalog. |
| `@voltras/workout-analytics/schema` | `src/schema/index.ts` | `Session` / `SetRecord` / `RepRecord` types, zod validators, migration registry. |
| `@voltras/workout-analytics/store` | `src/store/index.ts` | `SessionStore` interface, error classes, `MigrationRunner`, `withTransaction`, `prepareForSave`, `applyConnectionPragmas`. |
| `@voltras/workout-analytics/store/sqlite-node` | `src/store/sqlite-node/index.ts` | Node driver via `better-sqlite3@^11` (optional peer). |
| `@voltras/workout-analytics/store/sqlite-expo` | `src/store/sqlite-expo/index.ts` | Expo / RN driver via `expo-sqlite@^15` (optional peer). |

- **Runtime dep**: `zod@^3` (validators).
- **Optional peer deps** (declared via `peerDependenciesMeta`, `package.json:65-72`): `better-sqlite3@^11`, `expo-sqlite@^15`. Consumers install only the driver they need.
- **Engines**: Node `>=20.0.0` (`package.json:120-122`).

## Position in the workspace

Workspace map: `../../../CLAUDE.md`.

```
voltra-private (protocol generation)
        ↓ generates
voltra-node-sdk (BLE + decoded telemetry)
        ↓ npm publish
        ↓
        ├──────────────► voltras-mcp ────► live-state.ts feeds samples → addSampleToSet
        └──────────────► voltras/mobile ──► fixtures/physics-engine generate samples
                                            voltra-adapter.ts → WorkoutSample
```

`@voltras/workout-analytics` sits **downstream of the SDK** and is consumed by both `voltras-mcp` (server) and `voltras/mobile` (React Native app). The package itself takes no dependency on the SDK — adapters live in the consumers today and are scheduled to relocate into a `/adapters/voltra-sdk` subpath in 2.0.0 (see `status.md` and `integration.md`).

## Design principles

1. **Immutable data**. `Phase`, `Rep`, `Set`, `StreamingDistribution`, `LoadVelocityProfile`, etc. are all readonly interfaces. Mutator functions (`addSampleToSet`, `addSample`, `addDataPoint`) return new objects — they never mutate inputs. Empty constants are `Object.freeze`'d (e.g. `EMPTY_PHASE` at `src/models/phase.ts:41-55`, `EMPTY_DISTRIBUTION` at `src/stats/distribution.ts:29-35`).

2. **O(1) running aggregates**. Phase stores `_totalVelocity`, `_totalForce`, `_totalLoad`, `_movementSampleCount`, `_totalHoldDuration`, plus peaks. Means are derived in O(1) (`src/models/phase.ts:114-131`). `StreamingDistribution` uses Welford's online algorithm for numerically stable variance (`src/stats/distribution.ts:48-64`).

3. **Hardware-agnostic input contract**. `WorkoutSample` (`src/models/sample.ts:10-53`) is the universal interface. Vendor adapters convert device-specific frames into `WorkoutSample`. The package defensively normalizes velocity via `Math.abs` (`src/models/phase.ts:74`) so a buggy adapter does not silently zero peaks.

4. **Configurable schemes over hard-coded thresholds**. Classification (RIR, consistency, outlier, quality, confidence) is parameterized via `BreakpointScheme<T>` and `InterpolationScheme` (`src/stats/schemes.ts`). Defaults ship as named exports (`DEFAULT_RIR_SCHEME`, `DEFAULT_CONSISTENCY_SCHEME`, etc.) but every analytics function that classifies accepts an override.

5. **Opt-in storage**. The analytics surface and the storage layer are independent. A consumer can build the entire VBT pipeline in memory; persistence is a separate subpath behind an optional peer dependency. `SessionStore` is implemented by both drivers (`src/store/session-store.ts:19-101`).

6. **Pure functions over classes**. Analytics live as standalone functions taking `Rep` / `Set`, not methods. Only the storage layer uses classes (`MigrationRunner`, driver adapters); the analytics, VBT, stats, and exercises modules are pure.

## Module map

| Source dir | Responsibility | Key entry |
| --- | --- | --- |
| `src/models/` | Data primitives — `WorkoutSample`, `Phase`, `Rep`, `Set`, `LoadSettings`, tempo. Sample assembly. | `src/models/index.ts` |
| `src/stats/` | `StreamingDistribution` (Welford) + classification schemes. | `src/stats/index.ts` |
| `src/analytics/` | Rep, set, fatigue, quality, intensity, session analytics. Most consumer-facing surface. | `src/analytics/index.ts` |
| `src/vbt/` | VBT-specific: constants, LV profile, baseline, e1RM, coverage, advanced fitting. | `src/vbt/index.ts` |
| `src/exercises/` | Exercise catalog with runtime injection (`setCatalog` / `loadCatalog`) and indexed lookups. | `src/exercises/index.ts` |
| `src/schema/` | Persistence record types + zod validators + SQL migration registry. | `src/schema/index.ts` |
| `src/store/` | Driver-agnostic store primitives: `SessionStore` interface, `MigrationRunner`, `withTransaction`, `prepareForSave`, error classes. | `src/store/index.ts` |
| `src/store/sqlite-node/` | `better-sqlite3` driver + factory `createSqliteNodeStore`. | `src/store/sqlite-node/index.ts` |
| `src/store/sqlite-expo/` | `expo-sqlite` driver + factory `createSqliteExpoStore`. | `src/store/sqlite-expo/index.ts` |
| `src/index.ts` | Public barrel for the root subpath. | `src/index.ts:9-291` |

See `code-map.md` for line-level detail.

## What the package does NOT do

- **No device I/O.** No BLE, no file I/O outside the storage subpaths, no network. All inputs arrive as `WorkoutSample` or pre-parsed values.
- **No device-asserted set/rep boundaries** (yet). Rep boundaries are detected from phase transitions in the sample stream. Device-emitted boundaries (`onPerRep`, vendor summary frames) are deferred to 2.0.0 (`DeviceAssertedSet`, `DeviceAssertedRep`). See `status.md`.
- **No adapter for SDK frames** (yet). Each consumer maintains its own adapter today. The `@voltras/workout-analytics/adapters/voltra-sdk` subpath is planned for 2.0.0.
- **No session orchestrator**. `WorkoutSession` (a higher-level facade that ingests SDK events and emits enriched events) is planned for 2.0.0 — the package today only exposes per-set primitives.
- **No SI-unit conversion.** Force is in lbs; output of `getRepImpulse` / `getRepWork` / `getRepMeanConcentricPower` is in lbs-derived units. See `data-model.md` for the unit contract.
- **No ID generation** for storage records. Callers supply `id`s; the store returns `StoreError('duplicate id: <id>')` on PK conflict.
- **No mutation of inputs.** Every "add" returns a new object.
