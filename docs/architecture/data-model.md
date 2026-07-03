# Data model

The core data hierarchy is `WorkoutSample` → `Phase` → `Rep` → `Set`. Plus `LoadSettings` and `Tempo` as separate concerns.

## Table of contents

- [Unit hazards (READ THIS FIRST)](#unit-hazards-read-this-first)
- [`MovementPhase`](#movementphase)
- [`WorkoutSample`](#workoutsample)
- [`Phase`](#phase)
- [`Rep`](#rep)
- [`Set`](#set)
- [Rep boundary detection](#rep-boundary-detection)
- [`LoadSettings`](#loadsettings)
- [`Tempo`](#tempo)

---

## Unit hazards (READ THIS FIRST)

These are documented contract gotchas that have cost time before. The package does not error if you violate them — it silently produces wrong numbers. Sources: `CHANGELOG.md` 1.1.0 "Fixed" notes; `src/models/sample.ts:23-49`; rep-analytics docstrings at `src/analytics/rep-analytics.ts:88-94`, `:122-133`, `:236-243`.

### Velocity is magnitude-only

`WorkoutSample.velocity` MUST be **non-negative** (m/s). Direction of motion is encoded by `phase` (CONCENTRIC vs ECCENTRIC), NOT by velocity sign.

- SDK 0.6.0+ reports velocity as a **signed `int16`** — eccentric velocity is **negative**. Adapters MUST apply `Math.abs(value)` at the boundary before constructing a `WorkoutSample`.
- `src/models/phase.ts:74` defensively normalizes via `Math.abs` so a buggy adapter does not silently zero peak velocity (`Math.max(peakVelocity, -1.2)` would yield `0` and lose the peak). This is a safety net, not the contract — adapters should pass magnitudes.

### Force is in lbs, NOT tenths-lbs

`WorkoutSample.force` MUST be in **pounds** (lbs), not the device wire format.

- SDK frames report force as `uint16` **tenths-of-lbs**. Adapters MUST divide by 10 before populating `WorkoutSample.force`.
- Forwarding the raw tenths value silently inflates these by 10×:
  - `getRepImpulse` (`src/analytics/rep-analytics.ts:95-117`)
  - `getRepWork` (`:135-157`)
  - `getRepMeanConcentricPower` (`:244-258`)
  - All eccentric/total variants and any downstream metric that ingests these.
- There is no runtime guard. The package treats `force` as opaque magnitude.

### Output unit precision

`getRepImpulse` returns **lbs·s** (NOT N·s). `getRepWork` returns **lbs·position-units** (NOT Joules — `position` is normalized 0..1 cable position, not meters). `getRepMeanConcentricPower` is `getRepWork` / `time`, so **lbs·position-units / s** (NOT Watts). To convert to SI, scale force by 4.448 N/lb and resolve `position` to meters of cable travel — neither is done by the package.

---

## `MovementPhase`

```ts
enum MovementPhase {
  IDLE = 0,
  CONCENTRIC = 1, // Lifting (muscle shortening)
  HOLD = 2,       // Isometric hold / transition at top
  ECCENTRIC = 3,  // Lowering (muscle lengthening)
}
```

Source: `src/models/types.ts:8-13`. UI display names (`'Ready'`, `'Lifting'`, `'Lowering'`, `'Hold'`) at `src/models/types.ts:18-23`.

In `Phase`/`Rep` aggregation, `IDLE` and `HOLD` are **both** treated as pause: they contribute to hold-duration but NOT to velocity / force / load running aggregates (`src/models/phase.ts:64`, `src/models/rep.ts:56`).

## `WorkoutSample`

Definition: `src/models/sample.ts:10-53`.

| Field | Type | Unit | Notes |
| --- | --- | --- | --- |
| `sequence` | `number` | counter | Incrementing from device. For drop detection. |
| `timestamp` | `number` | ms since epoch | Source-device clock if available, else wall clock. |
| `phase` | `MovementPhase` | enum | Direction of motion + IDLE/HOLD pause states. |
| `position` | `number` | normalized 0..1 | 0 = start (cable in), 1 = full extension. |
| `velocity` | `number` | m/s | **MUST be non-negative.** Magnitude only. |
| `force` | `number` | **lbs** | **MUST be lbs**, NOT tenths-lbs. Always non-negative. |
| `load` | `number?` | lbs | Instantaneous resistance. Optional for backward compatibility. |

The contract is enforced socially (docstrings + adapter discipline), not by the type system. Phase aggregation (`src/models/phase.ts:74`) defends against signed velocity by `Math.abs`-ing on insert. There is no equivalent guard for `force`.

## `Phase`

Definition: `src/models/phase.ts:15-35`.

A `Phase` is a "bag of samples with metrics". Its meaning (concentric vs eccentric) comes from which slot it occupies on `Rep` — there is no `kind` field on `Phase`.

| Field | Type | Description |
| --- | --- | --- |
| `samples` | `readonly WorkoutSample[]` | All samples added to this phase. |
| `startTime` | `number` | ms timestamp of first sample. |
| `endTime` | `number` | ms timestamp of last sample. |
| `startPosition` | `number` | Position at first sample. |
| `endPosition` | `number` | Position at last sample. |
| `_totalVelocity` | `number` | Running sum of velocity over **movement** samples (excludes IDLE/HOLD). |
| `_totalForce` | `number` | Running sum of force over movement samples. |
| `_totalLoad` | `number` | Running sum of load over movement samples. |
| `_movementSampleCount` | `number` | Count of movement samples (denominator for means). |
| `_totalHoldDuration` | `number` | Cumulative ms spent in IDLE/HOLD. |
| `peakVelocity` | `number` | Max velocity over movement samples. |
| `peakForce` | `number` | Max force over movement samples. |
| `peakLoad` | `number` | Max load over movement samples. |

`EMPTY_PHASE` (`src/models/phase.ts:41-55`) is a frozen instance — start from this constant rather than constructing `Phase` literals.

Insertion: `addSampleToPhase(phase, sample)` (`src/models/phase.ts:61-91`) returns a NEW `Phase`. IDLE / HOLD samples skip the velocity / force / load aggregation and only accumulate hold time.

Derived metrics (all O(1) via the running aggregates, `src/models/phase.ts:102-135`):
- `getPhaseDuration(phase)` — total seconds.
- `getPhaseHoldDuration(phase)` — IDLE + HOLD seconds.
- `getPhaseMovementDuration(phase)` — duration minus hold.
- `getPhaseMeanVelocity(phase)`, `getPhaseMeanForce(phase)`, `getPhaseMeanLoad(phase)`.
- `getPhasePeakLoad(phase)`.
- `getPhaseRangeOfMotion(phase)` — `|endPosition − startPosition|`.

`rebuildPhaseFromSamples(samples)` (`src/models/phase.ts:96-98`) reconstructs a Phase from a sample array; used internally by `completeSet` after trimming.

## `Rep`

Definition: `src/models/rep.ts:24-28`.

| Field | Type | Description |
| --- | --- | --- |
| `repNumber` | `number` | 1-based index assigned by `Set` on rep creation. |
| `concentric` | `Phase` | Lifting + hold-at-top samples. |
| `eccentric` | `Phase` | Lowering + hold-at-bottom samples. |

`createRep(repNumber)` initialises both phases to `EMPTY_PHASE` (`src/models/rep.ts:33-39`).

**Sample routing inside `addSampleToRep` (`src/models/rep.ts:52-65`):**

| Incoming sample.phase | `isInEccentricPhase(rep)`? | Routed to |
| --- | --- | --- |
| `CONCENTRIC` | — | `concentric` |
| `ECCENTRIC` | — | `eccentric` |
| `IDLE` or `HOLD` | `false` (eccentric not started) | `concentric` (counted as hold-at-top) |
| `IDLE` or `HOLD` | `true` (eccentric started) | `eccentric` (counted as hold-at-bottom) |

`isInEccentricPhase(rep)` (`src/models/rep.ts:44-46`) returns true once the eccentric phase has any samples.

Derived metrics (all O(1), `src/models/rep.ts:69-110`):
- `getRepDuration` — concentric start to eccentric end (or concentric end if no eccentric).
- `getRepTempo` — formats movement / hold durations as `"E-HT-C-HB"` via `formatTempo`.
- `getRepMeanVelocity` — concentric only (primary VBT signal).
- `getRepPeakVelocity` — concentric peak.
- `getRepPeakForce` — max across BOTH phases.
- `getRepRangeOfMotion` — concentric **displacement traversed**, `getPhaseRangeOfMotion(concentric)` = `|endPosition − startPosition|`. ROM is a span, not a coordinate; it is NOT the absolute top-of-rep position (that over-reports by the concentric start offset on any rep not beginning at 0 — WA-02.03).
- `getRepSamples` — concat of both phases' samples.
- `getRepMeanLoad` — concentric mean. `getRepPeakLoad` — max across both phases.

## `Set`

Definition: `src/models/set.ts:30-34`.

| Field | Type | Description |
| --- | --- | --- |
| `reps` | `readonly Rep[]` | All reps in the set. |
| `loadSettings` | `LoadSettings?` | Optional. If provided, drives per-frame load when adapters compute `WorkoutSample.load`. |

`createSet(loadSettings?)` (`src/models/set.ts:39-41`) starts an empty set.

`addSampleToSet(set, sample)` (`src/models/set.ts:47-65`) is the single ingest entry point. See [Rep boundary detection](#rep-boundary-detection).

`completeSet(set)` (`src/models/set.ts:94-104`) trims trailing IDLE samples from the last rep's active phase (eccentric if started, else concentric) by rebuilding the phase from the trimmed sample array.

Set-level helpers (`src/models/set.ts:113-174`):
- `getSetRepCount(set)`, `getSetDuration(set)`.
- `getSetTimeUnderTension(set)` — sum of concentric + eccentric movement time across reps (excludes holds).
- `getSetLoad(set)` — base weight from `loadSettings.weight` (the simple scalar for volume / e1RM / stimulus).
- `getSetMeanLoad(set)` — mean per-frame load across all reps (richer signal when chains/eccentric are active).
- `getSetPeakLoad(set)` — peak per-frame load across all reps.

## Rep boundary detection

Implemented in `addSampleToSet` (`src/models/set.ts:47-65`):

1. **Pre-first-rep**: while no rep exists, samples are ignored UNLESS `sample.phase === CONCENTRIC`. The first concentric sample creates rep 1 and routes the sample to its concentric phase.

2. **Eccentric → concentric transition**: the rule for "new rep starts here". If the last rep `isInEccentricPhase` AND the incoming sample is `CONCENTRIC`, a new rep is appended (`reps.length + 1`) and the sample becomes the first sample of its concentric phase.

3. **Otherwise**: the sample is routed to the current (last) rep via `addSampleToRep`. IDLE samples land on the active phase as hold time.

This is **device-agnostic, phase-transition-only** detection. It does not consume device-emitted rep markers (e.g. SDK `onPerRep`). Device-asserted boundaries are deferred to 2.0.0 (`DeviceAssertedRep` / `DeviceAssertedSet`) — see `status.md`.

The autoregulation spec discusses optional minimum-rep-duration jitter filters (`voltra_vbt_autoregulation_spec.md` section 1.2). The current implementation does NOT enforce a minimum duration — a phase-transition that produces a sub-second rep will create a real rep object.

## `LoadSettings`

Definition: `src/models/load.ts:24-31`. Hardware-agnostic configuration for resistance.

| Field | Type | Unit | Description |
| --- | --- | --- | --- |
| `weight` | `number` | lbs | Base weight (5–200 on Voltra). |
| `chains` | `number` | lbs | Reverse resistance — full at position 0, decays linearly to 0 at position 1. |
| `eccentric` | `number` | percent (-195..195) | Adjustment applied to base weight during eccentric phase only. |

`DEFAULT_LOAD_SETTINGS` is `{ weight: 0, chains: 0, eccentric: 0 }` (`src/models/load.ts:36-40`).

`calculateFrameLoad(settings, position, phase)` (`src/models/load.ts:70-89`) computes the instantaneous load:

```
load = weight
     + (chains > 0 ? chains * max(0, 1 - position) : 0)
     + (eccentric != 0 && phase == ECCENTRIC ? weight * eccentric / 100 : 0)
```

Floored at 0. The chains curve is a linear simplification — real chain geometry depends on length and floor height.

`getEffectiveLoad(settings)` (`src/models/load.ts:109-111`) returns `weight` only, used by `getSetLoad` and downstream analytics that want a single scalar load.

## `Tempo`

`TempoParts` (`src/models/tempo.ts:11-16`) and the format/parse helpers (`src/models/tempo.ts:19-28`):

```
"E-HT-C-HB" — eccentric, hold-top, concentric, hold-bottom (whole seconds)
```

`getRepTempo(rep)` (`src/models/rep.ts:75-82`) constructs this from the phase movement / hold durations:
- `eccentric` ← `getPhaseMovementDuration(rep.eccentric)`
- `holdTop` ← `getPhaseHoldDuration(rep.concentric)` — IDLE/HOLD samples in the concentric phase
- `concentric` ← `getPhaseMovementDuration(rep.concentric)`
- `holdBottom` ← `getPhaseHoldDuration(rep.eccentric)` — IDLE/HOLD in the eccentric phase

All durations are `Math.round`-ed to whole seconds in the formatted string.
