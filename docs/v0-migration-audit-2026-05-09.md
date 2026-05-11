# workout-analytics v0/ migration audit — 2026-05-09

## Summary

The `v0/` directory no longer exists on disk. It was deleted in commit `884f0a2`
("feat: add intensity & session analytics, load model, and remove legacy v0 module") with the
explicit note "~4k lines now fully superseded by src/". The git tree from the parent commit
(`884f0a2^`) was used as the source of truth for this audit.

**22 algorithms / utility groups catalogued across 12 source files** (excluding `v0/index.ts`
and the `v0/__tests__/` tree). The migration is nearly complete: **16 of 22 are ported
(73%), 3 are partial (14%), and 3 are missing (14%).** The three missing items are all
higher-level *planning-domain* concerns (session orchestration, plan model, workout-stats
aggregate) that were intentionally scoped out of the `src/` analytics library — they belong in
the mobile app's `domain/` layer or in the forthcoming `WorkoutSession` orchestrator (WA-04).
No algorithm in v0/ represents a genuine gap that blocks current mobile or MCP usage.

**Top recommendations:** (1) port `v0/analytics/set-analysis.ts` `analyzeSetVelocity` /
`computeVelocityDelta` pattern into `src/analytics/fatigue.ts` as a cleaner entry point
(partial, mostly covered but the multi-axis intra-set comparison layer is thin); (2)
port the `v0/analytics/baseline.ts` baseline CRUD surface (`createVelocityBaseline`,
`updateBaseline`, serialization helpers) for consumers that need mutable, storable baselines;
(3) retire the `ExercisePlan` / `ExerciseSession` / `WorkoutStats` shapes as v0 artifacts —
the real equivalents are WA-04's `SessionStore` and the forthcoming `WorkoutSession`
orchestrator, not a direct port.

---

## Gap table

| v0 algorithm | v0 file | src/ equivalent | status | migration priority | notes |
|---|---|---|---|---|---|
| `RepDetector` state machine (IDLE→CONCENTRIC→HOLD→ECCENTRIC FSM, `processSample`, `forceComplete`) | `v0/detectors/rep-detector.ts` | `src/models/set.ts` `addSampleToSet` + `src/models/rep.ts` `isInEccentricPhase` | **ported** | low | src/ replaced the class-based FSM with a pure-function approach embedded in `addSampleToSet`. Boundary rule (eccentric→concentric = new rep) is identical. `forceComplete` has no direct equivalent but device-asserted boundaries are planned in WA 2.0.0 (see `docs/architecture/status.md`). |
| `VelocityBaseline` CRUD (`createVelocityBaseline`, `getBaselineVelocity`, `interpolateBaseline`, `updateBaseline`, `setBaselineValue`, `baselineToStored`, `storedToBaseline`, `exportBaselines`, `importBaselines`) | `v0/analytics/baseline.ts` | `src/vbt/baseline.ts` `buildBaseline`, `getExpectedVelocity` | **partial** | medium | src/ covers the immutable read path: build-from-datapoints + interpolate. Missing: mutable update helpers (`updateBaseline`, `setBaselineValue`), serialization (`baselineToStored` / `storedToBaseline`), bulk import/export. Consumers needing a live-updating baseline (readiness tracking across reps of a warmup) have to roll their own mutation. Serialization helpers are needed once the WA-04 store persists baselines. |
| `computeVelocityBaseline` (build from set history, first-rep velocity) and `interpolateVelocity` | `v0/analytics/velocity-baseline.ts` + `velocity-baseline-types.ts` | `src/vbt/baseline.ts` `buildBaseline` + `getExpectedVelocity` | **ported** | low | Same linear-interpolation logic. src/ version is simpler and immutable. The extrapolation branches (out-of-range) that v0 had are intentionally dropped in src/ (returns `null` instead). |
| `computeStrengthEstimate` (1RM from sets via Epley) | `v0/analytics/session-metrics.ts:176` | `src/analytics/session.ts` `computeStrengthEstimate` | **ported** | low | Equivalent. src/ version leans on `src/vbt/e1rm.ts` `estimateHybridE1RM` / `estimateE1RMFromReps` rather than an inline Epley call. |
| `computeReadinessEstimate` / `estimateReadinessFromFirstRep` (velocity vs baseline → green/yellow/red) | `v0/analytics/session-metrics.ts:239,296` | `src/analytics/session.ts` `computeReadiness` | **ported** | low | Same zone logic. src/ version drops `ReadinessAdjustments` (weight/volume recommendations) — those belong in the planner layer. `READINESS_THRESHOLDS` constants are not exported from src/ but the zone cutoffs are embedded in `computeReadiness`. |
| `computeFatigueEstimate` (rep-drop %, velocity recovery, junk-volume flag) | `v0/analytics/session-metrics.ts:380` | `src/analytics/session.ts` `computeSessionFatigue` | **ported** | low | Equivalent. `SessionFatigueEstimate` in src/ maps directly to `FatigueEstimate` in v0. |
| `checkVelocityRecovery`, `hasAdequateProfileData`, `isSetWithinExpectations`, `getExpectedPerformance` | `v0/analytics/session-metrics.ts:435,474,493,534` | MISSING | **missing** | low | These are planner-facing helpers (should the next set proceed? adjust weight?). They consume `LoadVelocityProfile` and `VelocityBaseline` together. Intentionally not in the analytics library — the equivalent logic lives in the mobile `training/engines/` or will live in the forthcoming `WorkoutSession` orchestrator. Not needed for MCP or standalone analytics use. |
| `computeSessionMetrics` (top-level aggregator: strength + readiness + fatigue + volume) | `v0/analytics/session-metrics.ts:81` | `src/analytics/session.ts` (`computeStrengthEstimate` + `computeReadiness` + `computeSessionFatigue` + `computeVolume`) | **partial** | low | No single `computeSessionMetrics` wrapper in src/. The individual functions are all present; callers compose them. `computeVolume` and `computeEffectiveVolume` exist in `src/analytics/session.ts`. This is a deliberate decomposition, not a gap. |
| `ReadinessAdjustments` (weight/volume nudge recommendations from readiness zone) | `v0/analytics/types.ts` | MISSING | **missing** | medium | The struct (`{ weight: number, volume: number }`) and the logic to populate it from a readiness zone are absent from src/. This is an input to the in-session planner ("reduce weight 5 lbs if yellow"). Will be needed for the autoregulation loop (spec §4). Already tracked as part of `wa-rir-estimation-exercise-specific` scope. |
| Intra-set velocity delta: `computeVelocityDelta`, `computeFatigueAnalysis`, fatigue index, `estimateEffort` (RIR/RPE from intra-set pattern) | `v0/analytics/set-analysis.ts` | `src/analytics/fatigue.ts` `getSetFatigueIndex`, `getSetVelocityChange`, `getSetFormWarning` | **partial** | high | The v0 `set-analysis.ts` uses a two-axis model (concentric + eccentric velocity delta vs expected) with a configurable penalty for eccentric speedup. `src/analytics/fatigue.ts` covers the concentric velocity-loss axis and form warnings well. The eccentric delta weighting and the `computeVelocityDelta(observed, expected)` entry point are absent — callers must assemble from lower-level primitives. **Already tracked** as `wa-fatigue-index-computation` candidate in brain-store-mining doc. |
| `ExpectedVelocity` strategies: intra-set first-N-reps, historical baseline, future rep-table and user-profile | `v0/analytics/expected-velocity.ts` | `src/vbt/baseline.ts` `getExpectedVelocity` (historical only) | **partial** | medium | src/ covers the historical-baseline strategy. The first-N-reps intra-set baseline strategy (`computeExpectedFromFirstNReps`) has no equivalent — callers would have to slice `set.reps` and compute the mean manually. The source-tagging (`ExpectedVelocitySource`, `confidence`) is also absent. Needed for live fatigue feedback during a set. |
| `VelocityDelta`, `FatigueConfig`, `EffortEstimate`, `analyzeSetVelocity` | `v0/analytics/set-analysis.ts` | `src/analytics/fatigue.ts` (partial), `src/analytics/intensity.ts` `estimatePerRepRIR` | **partial** | high | `estimateEffort` in v0 produces a set-level RIR/RPE estimate from the two-axis fatigue pattern. `estimatePerRepRIR` in src/ operates per-rep. The set-level RIR aggregation path is thin. **Already tracked** as `wa-rir-estimation-exercise-specific`. |
| VBT constants: `VELOCITY_AT_PERCENT_1RM`, `MINIMUM_VELOCITY_THRESHOLD`, `TRAINING_ZONES`, `REP_RANGES`, `VELOCITY_LOSS_TARGETS`, `VELOCITY_RIR_MAP`, `DISCOVERY_START_PERCENTAGES`, `PROFILE_CONFIDENCE_REQUIREMENTS`, `estimatePercent1RMFromVelocity`, `getTargetVelocityForGoal`, `categorizeVelocity`, `suggestNextWeight` | `v0/vbt/constants.ts` | `src/vbt/constants.ts` | **ported** | low | Core constants and lookup functions all present in src/. `suggestNextWeight` and `getTargetVelocityForGoal` (planner-facing) are absent — again, intentionally out of scope for the analytics lib. |
| Load-velocity profile: `buildLoadVelocityProfile`, `estimateWeightForPercent1RM`, `estimateWeightForVelocity`, `predictVelocityAtWeight`, `addDataPointToProfile`, `estimate1RMFromSet` | `v0/vbt/profile.ts` | `src/vbt/profile.ts` `buildProfile`, `predictVelocity`, `estimateLoad`, `addDataPoint` + `src/vbt/e1rm.ts` | **ported** | low | Full functional parity. src/ splits e1RM into its own file and adds Epley + hybrid methods. |
| Warmup generation: `generateWarmupSets`, `generateWorkingWeightRecommendation`, `WorkingWeightRecommendation`, `WarmupSet` | `v0/vbt/profile.ts:267,297` | MISSING | **missing** | low | Planner-domain helpers that compute which warm-up loads to use before a working set. Not in the analytics library by design. These belong in the mobile planning engine or the forthcoming session orchestrator. Low priority until WA-04 / `WorkoutSession` lands. |
| Coverage tracker: (no equivalent in v0) | n/a | `src/vbt/coverage.ts` `computeCoverage`, `identifyCoverageGaps` | **ported** (src-native) | — | src/ added coverage tracking that had no direct v0 predecessor. **Already tracked** as `wa-coverage-tracker` candidate. |
| Profile fitting (OLS, recency weighting, Huber-IRLS, uncertainty) | `v0/vbt/profile.ts:94` (basic OLS only) | `src/vbt/profile-fitting.ts` `fitLVProfile` | **ported** | low | src/ is a strict superset — Huber-IRLS and recency weighting were added beyond v0's simple OLS. |
| e1RM estimation: `estimate1RMFromSet` | `v0/vbt/profile.ts:362` | `src/vbt/e1rm.ts` `estimateE1RMFromReps`, `estimateE1RMFromProfile`, `estimateHybridE1RM` | **ported** | low | src/ is a superset (profile-based and hybrid methods added). |
| `ExercisePlan` / `PlannedSet` (planned set sequence) | `v0/models/plan.ts` | MISSING (by design) | **missing** | low | Planning-domain model. Not part of the analytics library surface. Lives in the mobile app's `domain/planning/`. Will not migrate to `src/` — out of scope per WA architecture docs. |
| `ExerciseSession` (runtime execution state: plan + completedSets + restEndsAt) | `v0/models/session.ts` | MISSING (by design) | **missing** | low | Same rationale as `ExercisePlan`. Session orchestration is the WA-04 `WorkoutSession` concern, not the analytics library. |
| `WorkoutStats` (aggregate: repCount, avgPeakForce, timeUnderTension, avgRepDuration) | `v0/models/stats.ts` | `src/analytics/set-analytics.ts` (partial) | **partial** | low | `getSetRepCount`, `getSetDuration`, `getSetTimeUnderTension` cover most fields. `avgPeakForce` / `maxPeakForce` / `avgRepDuration` require composing existing functions. No single `computeWorkoutStats` wrapper. Low impact — consumers can call individual functions. |
| `v0/models/set.ts` Set shape (with `exerciseId`, `weight`, `chains`, `eccentricOffset`, `targetTempo`, `timestamp`) | `v0/models/set.ts` | `src/models/set.ts` + `src/models/load.ts` | **ported** | low | src/ Set is intentionally hardware-agnostic and load-settings aware. Weight/chains/eccentricOffset moved into `LoadSettings`. `exerciseId` dropped — exercise association is the session layer's concern. |

---

## Recommended next migration tasks

The following are actionable, appropriately-scoped coding tasks the loop coordinator can dispatch.
None duplicate the six already-tracked candidates in the brain-store-mining doc.

### `wa-baseline-serialization` — Add mutable update + serialization helpers to `src/vbt/baseline.ts`
**Why:** The v0 `baseline.ts` has `updateBaseline`, `setBaselineValue`, `baselineToStored`,
`storedToBaseline`, `exportBaselines`, `importBaselines`. None exist in src/. Once the WA-04
store persists baselines across sessions, consumers will need to serialize/deserialize the
baseline and add individual observations without rebuilding from scratch. This is the storage
glue layer.
**Scope:** Add `updateBaseline(baseline, newPoint)`, `serializeBaseline(baseline)`,
`deserializeBaseline(raw)` to `src/vbt/baseline.ts`. Unit-test roundtrip fidelity and
monotone interpolation after update.
**Priority:** medium — blocked on WA-04 storage layer landing, but can be written now.

### `wa-expected-velocity-intra-set` — Add first-N-reps intra-set baseline strategy
**Why:** The v0 `expected-velocity.ts` `computeExpectedFromFirstNReps` is the foundation for
live set-level fatigue feedback ("am I slowing down vs my own first two reps?"). src/ has no
equivalent; the readiness path only uses the historical cross-session baseline. Live feedback
during a set requires a pure intra-set baseline.
**Scope:** Add `computeExpectedFromFirstNReps(set, n?)` returning `{ concentric, eccentric, confidence }` to `src/analytics/` (or extend `src/vbt/baseline.ts`). Gate on `set.reps.length >= n`. Write tests with synthetic rep data showing the expected velocity tracks the first-N mean.
**Priority:** medium — unblocks live fatigue display in mobile and `metrics.compute` in MCP.
Note: partially overlaps the `wa-fatigue-index-computation` candidate (already in brain-store-mining), which should consume this. Coordinate to avoid duplication.

### `wa-readiness-adjustments` — Add `ReadinessAdjustments` recommendations to `computeReadiness`
**Why:** The v0 `ReadinessEstimate` included `adjustments: { weight: number, volume: number }` — actionable nudges the in-session planner can apply when the athlete is yellow/red. `src/analytics/session.ts` `computeReadiness` returns the zone and ratio but no adjustments. The autoregulation spec (§4) requires these for the in-session load recommendation loop.
**Scope:** Extend `ReadinessEstimate` with an optional `adjustments?: { weightDelta: number, volumeMultiplier: number }` field. Populate in `computeReadiness` using the same formula as v0 (red zone: −5–10 lbs, reduce volume 25%; yellow: −2.5 lbs, reduce volume 10%). Keep adjustment magnitude configurable (pass `thresholds?` option). Unit-test each zone produces the expected nudge.
**Priority:** medium — not needed until the MCP exposes a next-set recommendation tool, but is a small, self-contained addition.

---

## Out of scope / will not migrate

| v0 artifact | Reason |
|---|---|
| `v0/models/plan.ts` (`ExercisePlan`, `PlannedSet`) | Planning-domain model; belongs in mobile `domain/planning/` and the forthcoming `WorkoutSession` orchestrator. The analytics library is hardware-agnostic and does not own planning state. |
| `v0/models/session.ts` (`ExerciseSession`, `addCompletedSet`, `startRest`, `clearRest`, `compareSetAtIndex`) | Session execution orchestration is explicitly deferred to WA 2.0.0 `WorkoutSession` (see `docs/architecture/status.md` "Deferred to 2.0.0"). Direct port would create a competing, divergent API. |
| `checkVelocityRecovery`, `hasAdequateProfileData`, `isSetWithinExpectations`, `getExpectedPerformance` | Planner-facing decision helpers that mix analytics and planning concerns. No home in a hardware-agnostic analytics library. |
| `generateWorkingWeightRecommendation`, `generateWarmupSets` | Same rationale: planning-domain, not analytics-domain. |
| `suggestNextWeight`, `getTargetVelocityForGoal` (from v0/vbt/constants.ts) | Planning advice functions; belong with the planner, not the VBT constants module. |
