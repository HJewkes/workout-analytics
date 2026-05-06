# Autoregulation spec — pointer

The package's design north star for the **post-2.0.0** analytics surface is the internal spec at `../../voltra_vbt_autoregulation_spec.md` (v2026-01-24). This file is a pointer; it does not duplicate that document.

## What the spec covers

Reading order inside `voltra_vbt_autoregulation_spec.md`:

| Section | Topic |
| --- | --- |
| 0 | Goals + non-goals (notably: rules-based on day 1, statistical modeling later, future-proof shared layer for non-Voltra devices). |
| 1 | Core abstractions: frames → reps → sets → sessions. Includes the rep-segmentation rule preferring device-provided rep markers (1.2) and the rep summary metric inventory (1.3). |
| 2 | Normalized shared layer — device-agnostic event schema. Justifies the `WorkoutSample` contract. |
| 3 | Data models in TypeScript-style interfaces. Largely consistent with what `src/models/` exposes today. |
| 4+ | User profile (absolute strength, velocity profile, fatigue/readiness). |
| later | In-workout autoregulation (load/volume/rest adjustment in real time). |
| later | Across-workout progression (plan next workout, fill missing data gaps). |

## Status of the spec

- **The spec PRECEDES the current integration plan.** It was authored 2026-01-24. The Phase 4 / 2.0.0 work in `coordination/integration-plans/raw-signal-architecture.md` is the **active** plan and supersedes the spec where they conflict.
- Specifically: the spec's section 1.2 ("Prefer device-provided rep markers if available") aligns with the planned `DeviceAssertedRep` type in 2.0.0. The integration plan is the more concrete, scheduled version.
- The spec's user-profile and autoregulation sections describe surface that **does not yet exist** in the package. They are post-2.0.0 work — referenced for design direction, not for current behavior.

## What the spec is NOT

- Not a contract. Implementations may diverge where the integration plan or shipped code says otherwise.
- Not a public API document. It describes intended design for an internal audience.
- Not the user-facing README — that lives at `../../README.md`.

## Cross-references

- Integration plan (active): `../../../coordination/integration-plans/raw-signal-architecture.md` — Phase 4 covers the bridge and orchestrator landing concurrent with workout-analytics 2.0.0.
- Workspace memory: workspace `CLAUDE.md` and the project memory note `voltra_vbt_autoregulation_spec.md` as a key reference.

## Why this is a stub

The spec is a 21KB internal document that should be read directly when its content is needed. Duplicating its sections here would make the architecture docs harder to keep in sync. Treat it as `@reference`, not `@inline`.
