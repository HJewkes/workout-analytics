# Status

Current state of `@voltras/workout-analytics`. Snapshot date: 2026-05-06 (matches the package version below). Refresh when shipping a new version.

## Table of contents

- [Published version](#published-version)
- [What ships today](#what-ships-today)
- [Deferred to 2.0.0](#deferred-to-200)
- [Open design questions](#open-design-questions)
- [Known contract gotchas](#known-contract-gotchas)
- [Testing footprint](#testing-footprint)

## Published version

**1.1.0** (`package.json:3`).

| Version | Headline | Reference |
| --- | --- | --- |
| 1.1.0 | Expo SQLite driver subpath + SDK 0.6.0 contract tightening | `../../CHANGELOG.md` |
| 1.0.0 | ESM-only; subpath split for `/schema`, `/store`, `/store/sqlite-node` | `../../CHANGELOG.md` |

Engine: Node `>=20.0.0` (`package.json:120-122`).

## What ships today

- Hardware-agnostic data model: `WorkoutSample` → `Phase` → `Rep` → `Set`.
- O(1) running aggregates on `Phase` (mean/peak velocity, force, load; hold time).
- Tempo formatting (`E-PB-C-PT`).
- Defensive `Math.abs` on velocity inside `addSampleToPhase` (`src/models/phase.ts:74`) — hardens against signed velocity from SDK 0.6.0+.
- Full analytics surface: rep, set, fatigue, quality, intensity, session. See `analytics-surface.md`.
- VBT: constants table, OLS profile builder, baseline interpolation, e1RM (profile / Epley / hybrid), coverage tracking, advanced fitting (recency / quality / Huber-IRLS / uncertainty). See `vbt.md`.
- Stats primitives: Welford `StreamingDistribution`, breakpoint and interpolation schemes, defaults for RIR / consistency / outlier / quality / confidence. See `stats.md`.
- Exercises catalog with runtime injection, 4 indexes, search by name + aliases. See `exercises.md`.
- Storage: `SessionStore` interface + Node and Expo SQLite drivers, validators, migrations with SHA-256 verification, `prepareForSave`, `withTransaction`, `applyConnectionPragmas`. See `storage.md`.

## Deferred to 2.0.0

Per `../../CHANGELOG.md` 1.1.0 "Fixed" notes: **"Adapter relocation, `DeviceAssertedSet`, and `repDurationMs` integration are deferred to 2.0.0."**

The active plan is `../../../coordination/integration-plans/raw-signal-architecture.md` Phase 4. Headline items:

| Item | What's coming | Plan section |
| --- | --- | --- |
| **Adapter subpath** | `@voltras/workout-analytics/adapters/voltra-sdk` — typed SDK event → `WorkoutSample` + enrichment hints. Lifts inline adapters from MCP / mobile. | 4a |
| **`DeviceAssertedSet` + `DeviceAssertedRep`** | New types carrying device-emitted fields (`repDurationMs`, `deviceRepCount`, `deviceSetCounter`, `targetWeightTenths`, mode, raw frame). Coexist with phase-derived types. | 4b |
| **`WorkoutSession` orchestrator** | High-level facade ingesting typed SDK events, owning session state, emitting enriched events on device-asserted boundaries. Replaces consumer-side manual `addSampleToSet` calls. | 4c |
| **Mode-aware enrichment** | Per-mode summary aggregators (WeightTraining, Rowing, Isometric, …). | 4d |
| **`repDurationMs` integration** | Device-emitted rep duration as authoritative or alongside computed duration. | cross-cutting |
| **Optional persistence in session** | `WorkoutSession` accepts a `SessionStore`, persists on device-asserted set end. | 4e+ |
| **Configurable set-lifecycle policy** | Default: trust device. Override via MCP `set.end` call. Fallback signals (e.g. `force_threshold`). | 4i |

Release shape (per the plan): coordinated landing of SDK 0.7.0 + voltras-mcp 0.5.0 + workout-analytics 2.0.0. No additive intermediate.

## Open design questions

From the integration plan and recent audits. These are NOT settled:

- **Where does the adapter live for non-Voltra devices?** Current plan ships `/adapters/voltra-sdk`. A future `/adapters/<other>` is structurally allowed but no spec exists.
- **Cross-validation policy when phase-derived `Set` and `DeviceAssertedSet` disagree.** The plan calls this out as "diagnostic surface" (Phase 4b) but does not yet specify the semantics: does the device value win? Both reported with a divergence flag? An open `TODO` in the spec.
- **Mode-aware enrichment surface shape.** Modes are listed in the plan but the per-mode aggregator API is not designed.
- **Persistence schema evolution under 2.0.0.** The current schema (`src/schema/migrations/001_initial.sql`) does not carry mode or device-asserted fields. A v2 migration is implied but not drafted.
- **Set-lifecycle policy configuration surface.** `force_threshold` is mentioned as a fallback. The full `WatchConfig`-equivalent for the analytics layer is undefined.
- **Whether Voltra-specific scoring (`getSetStimulusScore`) should remain.** The function is explicitly marked as "a Voltra-specific heuristic, not a published metric" (`src/analytics/intensity.ts:154-160`). Composite scoring vs. surfacing only validated metrics (mechanical work) is an open call.

## Known contract gotchas

These cost time before. See `data-model.md` "Unit hazards" for full detail.

| Gotcha | Mitigation |
| --- | --- |
| `WorkoutSample.velocity` MUST be magnitude only (m/s, ≥ 0). SDK 0.6.0+ provides signed `int16`. | Adapter applies `Math.abs`. Phase aggregation defends with `Math.abs` (`src/models/phase.ts:74`). |
| `WorkoutSample.force` MUST be lbs. SDK frames are tenths-of-lbs. | Adapter divides by 10. **No runtime guard** — bug silently 10×s impulse / work / power. |
| `getRepWork` / `getRepImpulse` return lbs-derived units, NOT SI. | Documented in JSDoc; consumers must scale. |
| `prepareForSave` overwrites caller's `schemaVersion`. | Documented in `SessionStore.saveSession` JSDoc and `src/store/prepare-for-save.ts`. Caller can pass any number. |
| `validators` MUST NOT use `.default()`, `.transform()`, `.coerce()`. | D19 invariant in `src/schema/validators.ts:1-9`. Enforced by `validators.test.ts`. |
| WAL must succeed at connect time. | `applyConnectionPragmas` reads back `journal_mode` and throws `StoreError` if not `'wal'`. |
| `db.transaction(fn)` (better-sqlite3) rejects async callbacks. | `BetterSqlite3Driver` issues BEGIN/COMMIT manually + serializes via promise mutex. See `src/store/sqlite-node/driver.ts:14-28`. |

## Testing footprint

| Project | Owner |
| --- | --- |
| Unit + analytics + VBT + stats | `vitest` in this repo (`npm test`). |
| Storage Node driver | This repo, `src/__tests__/store/sqlite-node.test.ts`. |
| Storage Expo driver | Type resolution at build time. Runtime conformance suite skips on plain Node CI (native module unavailable). |
| Expo runtime functional tests | Owned by `voltras/mobile`. |
| Capture-replay regression (planned) | `voltras-mcp` Phase 4k — replay phase-5 captures through new adapter + `WorkoutSession`. |
| Integration tests against real captures (planned) | New `src/__tests__/voltra-integration/` suite per `coordination/integration-plans/workout-analytics-integration.md`. |
