# Integration with consumers

This document describes how `@voltras/workout-analytics` is integrated by its two known consumers today: `voltras-mcp` and `voltras/mobile`. For the planned 2.0.0 changes (adapter relocation, `WorkoutSession` orchestrator, `DeviceAssertedSet`), see `status.md` and the workspace integration plan.

## Table of contents

- [Consumer matrix](#consumer-matrix)
- [voltras-mcp](#voltras-mcp)
- [voltras/mobile](#voltrasmobile)
- [Adapter responsibility today](#adapter-responsibility-today)
- [Phase 4 (2.0.0) — planned changes](#phase-4-200--planned-changes)

## Consumer matrix

| Consumer | Imports from | Persistence layer | Adapter location | Sample source |
| --- | --- | --- | --- | --- |
| `voltras-mcp` | `@voltras/workout-analytics` (root) | NOT used today | Inline in `voltras-mcp/src/state/live-state.ts` (or `event-bridge.ts`) | Live SDK telemetry events. |
| `voltras/mobile` | `@voltras/workout-analytics` + Expo store | Yes (Expo SQLite driver) | `voltras/mobile/src/domain/device/voltra-adapter.ts` | Live SDK telemetry + fixture-generated samples (`__fixtures__/generators/`). |

## voltras-mcp

Source: `voltras-mcp/src/state/live-state.ts`. Imports at line 27-28:

```ts
import type { Rep, Set as AnalyticsSet, WorkoutSample } from '@voltras/workout-analytics';
import { createSet, addSampleToSet, completeSet } from '@voltras/workout-analytics';
```

### Pipeline

The `LiveState` class holds an in-progress `Set` (`_analyticsSet: AnalyticsSet | undefined`) and feeds samples through the canonical pipeline:

| Phase | Code in `live-state.ts` |
| --- | --- |
| Set start | `this._analyticsSet = createSet();` (around `:205`) |
| Sample ingest | `this._analyticsSet = addSampleToSet(this._analyticsSet, sample);` (around `:276`) |
| Set end | `completeSet(this._analyticsSet).reps` (around `:225-230`) |

The class header (around `:134`) describes this as "the canonical mobile-app pipeline" — confirming MCP and mobile follow the same shape.

### Samples come from the bridge

`voltras-mcp/src/state/event-bridge.ts` translates SDK device events (`onPerRep`, `onInProgress`, `onSummary`, etc.) into `WorkoutSample` and feeds `LiveState`. This translation is the **inline adapter** that 2.0.0 plans to relocate into `@voltras/workout-analytics/adapters/voltra-sdk`.

### What MCP does NOT use today

- **No persistence.** MCP does not call `createSqliteNodeStore`, `saveSession`, etc. Live state is in-memory only — the MCP server is a transient session, not a long-term store.
- **No analytics-derived enrichment yet.** The bridge returns rep / set summaries to MCP channels but does not currently consume the rich VBT / fatigue / quality functions exposed by `src/analytics/`. The integration plan calls for this in Phase 4.
- **No `repDurationMs` from the device.** The bridge currently IGNORES `onPerRep` payloads and runs the legacy `SET_START_GRACE_MS` finalize-on-STOP logic. Wiring vendor-frame fields (`targetWeightTenths`, `repDurationMs`, `repCount`) into channel events is queued (workspace memory: `voltras-mcp` notes).

### Cross-reference

Workspace audit `coordination/research/audit-2026-05-06-untested-capabilities.md:148` mentions that vendor decoders exposed by the SDK feed downstream into the workout-analytics pipeline.

## voltras/mobile

### Adapter

`voltras/mobile/src/domain/device/voltra-adapter.ts` exports `toWorkoutSample` and `toWorkoutSamples`. Imported by `voltras/mobile/src/domain/device/index.ts` (line 9). This is the dedicated mobile adapter — not yet shared with MCP.

The adapter is the responsible layer for the unit contract:
- `Math.abs(velocity)` for SDK 0.6.0+ signed velocity.
- `force / 10` for tenths-of-lbs.
- `MovementPhase` mapping from SDK frame phase byte.

### Fixtures and physics engine

`voltras/mobile/src/__fixtures__/generators/` contains a substantial fixture pipeline that generates `WorkoutSample` arrays from a physics engine — used in tests without requiring a device:

| File | Responsibility |
| --- | --- |
| `physics-engine.ts` | Simulates cable-machine kinematics and force production. |
| `sample-generator.ts` | Emits `WorkoutSample[]` from physics state. |
| `rep-builder.ts` / `rep-behaviors.ts` | Compose rep-shaped sample sequences (e.g. partial rep, paused rep, fatigued rep). |
| `set-builder.ts` / `set-compositions.ts` | Compose multi-rep sets with realistic fatigue curves. |
| `session-builder.ts` / `session-generator.ts` / `session-compositions.ts` | Multi-set sessions. |
| `mock-helpers.ts`, `phase-stubs.ts`, `plan-builder.ts`, `planning-builders.ts`, `planning-fixtures.ts`, `recording-generator.ts`, `seeder.ts`, `index.ts` | Supporting utilities. |

These fixtures feed `addSampleToSet` for end-to-end tests of the analytics pipeline against realistic input — the same path as live device data.

### Persistence

Mobile is the production consumer of the Expo SQLite store (`@voltras/workout-analytics/store/sqlite-expo`). The package's CI does NOT run `expo-sqlite` at runtime (native module, requires Expo SDK 54+ runtime); functional verification is owned by mobile's integration tests. See `storage.md` "Verification model" and `../../README.md` "Verification".

## Adapter responsibility today

The package is hardware-agnostic, so vendor-frame translation is **outside** its scope today. Each consumer maintains its own adapter:

| Consumer | Adapter location |
| --- | --- |
| `voltras-mcp` | Inline within bridge / live-state code. |
| `voltras/mobile` | `voltras/mobile/src/domain/device/voltra-adapter.ts`. |

The unit contract (`data-model.md` "Unit hazards") is enforced **at this boundary**. The package defends against signed velocity via `Math.abs` in `addSampleToPhase` (`src/models/phase.ts:74`), but force is opaque — adapter bugs that forward tenths-of-lbs silently 10× the impulse / work / power outputs.

Workspace integration plan `coordination/integration-plans/raw-signal-architecture.md:122` summarizes this: "Sample contract is strict — units matter, signed velocity from SDK 0.6.0+ must be `Math.abs`'d at the adapter boundary, force in tenths-lbs must be divided by 10."

## Phase 4 (2.0.0) — planned changes

Reference: `coordination/integration-plans/raw-signal-architecture.md` Phase 4 (lines 306+). Coordinated landing across SDK 0.7.0 + voltras-mcp 0.5.0 + workout-analytics 2.0.0.

| Change | Brief | Plan section |
| --- | --- | --- |
| **Adapter subpath** | Move adapters into `@voltras/workout-analytics/adapters/voltra-sdk`. Lift inline MCP adapter; refactor the mobile adapter to use the shared subpath. Eliminates duplicate adapter implementations. | 4a |
| **`DeviceAssertedSet` / `DeviceAssertedRep` types** | Distinct from phase-derived `Set` / `Rep`. Carry `deviceRepCount`, `deviceSetCounter`, `repDurationMs`, `targetWeightTenths`, mode-specific fields, raw frame ref. Cross-validate phase-derived vs device-asserted. | 4b |
| **`WorkoutSession` orchestrator** | Higher-level facade: ingests typed SDK device events, applies adapter internally, owns `LoadVelocityProfile` / `Session` state, fires enriched events on natural device-emitted boundaries. The bridge in `voltras-mcp` will migrate from manual `addSampleToSet` to `session.ingest(deviceEvent)`. | 4c |
| **Mode-aware enrichment** | Different modes (WeightTraining, Rowing, Isometric, etc.) get mode-specific aggregation atop the shared analytics. | 4d |
| **`repDurationMs` integration** | Use device-emitted per-rep duration alongside / instead of computed duration. | (cross-cutting) |
| **Optional persistence wiring** | `WorkoutSession` accepts an optional `SessionStore` and persists on `DeviceAssertedSetEnd`. | 4e+ |
| **Bridge migration** | Replace `live-state.ts` inline adapter + manual `addSampleToSet` with `WorkoutSession` import. | 4h |
| **Configurable set-lifecycle policy** | Trust device-emitted `DeviceAssertedSetEnd`; allow `set.end` MCP call as override; configurable fallbacks (e.g. `force_threshold`). | 4i |

Net effect for consumers post-2.0.0: a single shared adapter, stronger types around device-asserted boundaries, and an orchestrator that handles session-level state management instead of every consumer rolling their own. The current `addSampleToSet` / `completeSet` primitives remain for low-level consumers but become an internal detail of `WorkoutSession` for typical use.
