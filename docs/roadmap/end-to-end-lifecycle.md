# VBT Autoregulation System: End-to-End Lifecycle

This document describes the complete data flow from raw device telemetry through workout planning and real-time autoregulation.

## System Overview

```
Telemetry → Summaries → Profile Update → Next Workout Plan → In-Workout Autoregulation
                              ↑                                        │
                              └────────────────────────────────────────┘
```

---

## Lifecycle Stages

### 1. Data Collection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           DATA COLLECTION                                │
├─────────────────────────────────────────────────────────────────────────┤
│  VOLTRA Device (~11Hz)                                                   │
│       ↓                                                                  │
│  TelemetryFrame { t, pos, vel, force, phase }                           │
│       ↓                                                                  │
│  Rep Segmentation (phase transitions: ecc → con = new rep)              │
│       ↓                                                                  │
│  RepSummary { meanVCon, peakVCon, rom, tCon, tEcc, ... }               │
│       ↓                                                                  │
│  SetSummary { meanV1, meanVLast, velLossPct, reps[], inferred{} }      │
│       ↓                                                                  │
│  SessionSummary { sets[], volumeByExercise, hardRepsByMuscle }          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key transformations:**
- Frames (raw) → Reps (segmented by phase transitions)
- Reps → Sets (grouped by exercise block)
- Sets → Session (full workout context)

---

### 2. Post-Session Audit

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         POST-SESSION AUDIT                               │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Dynamic Tagging (no manual labels)                                   │
│     - warmup: low load relative to peak                                  │
│     - topSet: highest load in exercise block                             │
│     - backoff: same exercise after top set, load reduced                 │
│     - likelyFailure: velocity collapse + high velLoss                    │
│     - exploration: set in under-covered intensity bin                    │
│                                                                          │
│  2. Profile Update                                                       │
│     - Refit LV profile (v = a + b*load) with new data points            │
│     - Update e1RM estimate (hybrid LVP + reps-based)                     │
│     - Refresh coverage bins (mark intensity ranges as "seen")            │
│     - Update technique baseline (ROM, tempo norms)                       │
│                                                                          │
│  3. Readiness Signal                                                     │
│     - Compare rep1 velocities to expected → update R_day                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Dynamic tagging** eliminates the need for users to manually categorize sets. The system infers intent from load patterns and performance.

---

### 3. User Profile (Persistent State)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      USER PROFILE (Persistent)                           │
├─────────────────────────────────────────────────────────────────────────┤
│  ExerciseModel (per exercise):                                           │
│    ├─ e1RM { value, uncertainty, method, updatedAt }                    │
│    ├─ lvProfile { a, b, uncertainty, validLoadRange }                   │
│    ├─ pfModel { RIR prediction params }                                 │
│    ├─ techniqueBaseline { expectedROM, eccTempo, romTolerance }         │
│    └─ coverage { bins[{ range, lastSeenAt, n }] }                       │
│                                                                          │
│  Readiness { R_day: 0.85–1.05 }                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Design principle:** Store slow-moving parameters (e1RM, LV curve), derive fast-moving states (fatigue, readiness adjustments) on demand.

---

### 4. Next Workout Planner

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NEXT WORKOUT PLANNER                              │
├─────────────────────────────────────────────────────────────────────────┤
│  Inputs:                                                                 │
│    - ExerciseModel (e1RM, LV profile, coverage)                         │
│    - Recent session history (last 1-3 sessions)                          │
│    - Current readiness estimate (R_day)                                  │
│    - Training goal (strength vs hypertrophy)                             │
│                                                                          │
│  Planning Steps:                                                         │
│    1. Select goal → target intensity band                                │
│    2. Pick target proximity-to-failure (e.g., RIR 1-3)                  │
│    3. Choose load: load = e1RM × R_day × pctTarget                      │
│    4. Predict rep1 velocity from LV profile                              │
│    5. Define stop condition (velLoss threshold OR target RIR)            │
│    6. Check coverage gaps → schedule exploration set if needed           │
│                                                                          │
│  Output:                                                                 │
│    - Planned sets: { load, targetReps/targetRIR, restGuidance }         │
│    - Autoregulation rules for real-time adjustment                       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key formula:** `load = e1RM × R_day × pctTarget`

This combines the user's estimated max, their current readiness, and the goal-appropriate intensity percentage.

---

### 5. In-Workout Autoregulation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      IN-WORKOUT AUTOREGULATION                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Per Set:                                                                │
│    1. Observe rep1 velocity vs predicted                                 │
│       - If low: reduce load or extend rest                               │
│       - If high: small load increase or rep target increase              │
│                                                                          │
│    2. Track within-set fatigue (velLossPct)                             │
│       - Stop set when threshold reached OR target RIR                    │
│                                                                          │
│    3. Update within-workout fatigue state F                              │
│       - F_new = λ·F_old + (1-λ)·g(FI_set, intensity, volume)            │
│                                                                          │
│    4. Rest guidance                                                      │
│       - If rep1 suppressed + high prior fatigue → extend rest            │
│       - Check velocity recovery before next set                          │
│                                                                          │
│  Form Monitoring:                                                        │
│    - ROM shrinkage → fatigue warning                                     │
│    - Eccentric speedup → "slow the negative" cue                         │
│    - Grinding + loss of control → "consider ending set"                  │
└─────────────────────────────────────────────────────────────────────────┘
```

**Real-time feedback loop:** Every rep provides data that can trigger mid-set or between-set adjustments.

---

## Key Feedback Loops

| Loop | Timescale | Trigger | Action |
|------|-----------|---------|--------|
| **Within-set** | Seconds | Velocity loss threshold | Terminate set |
| **Between-sets** | Minutes | Rep1 velocity vs expected | Adjust load, extend rest |
| **Within-session** | ~1 hour | Fatigue state F accumulates | Modify later sets |
| **Between-sessions** | Days | Profile update, R_day | Adjust next workout plan |

---

## Confidence → Exploration Balance

The system balances **exploitation** (using known profile data) with **exploration** (gathering new data):

| Profile Confidence | Behavior |
|--------------------|----------|
| **Low** | Schedule more exploration sets, fill coverage gaps |
| **High** | Smoother autoregulation, exploit known parameters |

**Coverage gaps** are identified by tracking which intensity bins (`%e1RM`) have recent data:
- Missing low end → capture in warm-ups (singles at 30-50%)
- Missing mid → include moderate sets (6-10 reps at 60-75%)
- Missing high → add heavy single/double (85-92%) without failure

---

## See Also

- [voltra_vbt_autoregulation_spec.md](../../voltra_vbt_autoregulation_spec.md) — Full specification with algorithms and data models
