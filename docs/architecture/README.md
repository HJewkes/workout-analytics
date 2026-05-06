# Architecture documentation

This directory documents the **internals** of `@voltras/workout-analytics`. The package's user-facing `README.md` (one level up) covers installation, subpath exports, and quickstart usage; this directory is for engineers working on or integrating against the package.

The package is the largest and most under-documented of the four published libraries in the Voltras workspace relative to its size. Use these docs as your starting point before reading source.

## Reading order for a cold session

1. `overview.md` — what the package does and where it sits.
2. `data-model.md` — `WorkoutSample` → `Phase` → `Rep` → `Set`. **Read this before any analytics code.** The unit hazards on `WorkoutSample` are documented contract gotchas.
3. `code-map.md` — file/line guide to every directory under `src/`.
4. `analytics-surface.md` — full inventory of analytics functions.
5. Pick by topic: `vbt.md`, `storage.md`, `exercises.md`, `stats.md`.
6. `integration.md` — how voltras-mcp and voltras/mobile consume the package today.
7. `status.md` — published version, deferred work, open questions.
8. `autoregulation-spec.md` — pointer to the design north star.

## Document index

| File | Topic |
| --- | --- |
| `overview.md` | High-level architecture, package responsibility, ESM/subpath shape, key principles. |
| `data-model.md` | Core types (`WorkoutSample`, `Phase`, `Rep`, `Set`, `LoadSettings`, tempo). Unit contracts. Rep boundary detection. |
| `code-map.md` | Source tree by file with line citations. |
| `analytics-surface.md` | Every analytics function (rep, set, fatigue, quality, intensity, session). |
| `vbt.md` | Velocity-based training surface: constants, profile, baseline, e1RM, coverage, advanced fitting. |
| `storage.md` | `SessionStore` interface, schema, migrations, drivers, `withTransaction`, `prepareForSave`. |
| `exercises.md` | Exercise catalog: types, runtime injection, lookup functions. |
| `stats.md` | `StreamingDistribution`, `BreakpointScheme`, `InterpolationScheme`, default schemes. |
| `integration.md` | How voltras-mcp and voltras/mobile feed and consume the package. |
| `autoregulation-spec.md` | Pointer + summary for `voltra_vbt_autoregulation_spec.md` (post-2.0.0 design). |
| `status.md` | Current state, deferred 2.0.0 work, open design questions. |

## External references

- Package README: `../../README.md` (consumer-facing usage).
- Changelog: `../../CHANGELOG.md`.
- VBT autoregulation spec: `../../voltra_vbt_autoregulation_spec.md` (v2026-01-24, internal). The closest thing to a target spec for the analytics surface.
- Workspace integration plan: `../../../coordination/integration-plans/raw-signal-architecture.md` — Phase 4 covers the planned 2.0.0 work.
- Workspace coordination notes: `../../../coordination/integration-plans/workout-analytics-integration.md`.
