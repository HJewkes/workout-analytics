# BeyondPower VOLTRA Telemetry → VBT Autoregulation System
*Implementation design notes for Cursor (no code, but concrete algorithms + data models).*  
*Version: 2026-01-24*

---

## 0) Goals and non-goals

### Goals
- Normalize VOLTRA “frame telemetry” (≈11 Hz) into **rep/set/session summaries** that are:
  - Stable enough for rules-based use on day 1
  - Rich enough to power statistical modeling later
  - Portable to other devices (future-proof “shared layer”)
- Maintain a **user profile** that coalesces signals into:
  - **Absolute strength** (slow-moving): 1RM (or “maximal capability”) per exercise/pattern
  - **Velocity profile** (slow-moving): expected velocity at load (and vice versa)
  - **Fatigue / readiness** (fast-moving): within-workout and day-to-day modifiers
- Drive:
  - **In-workout autoregulation** (adjust load/volume/rest in real time)
  - **Across-workout progression** (plan next workout and fill missing data “gaps”)

### Non-goals (for v0)
- Perfect physiological modeling (CNS vs peripheral fatigue separation)
- Fully ML-driven system requiring large datasets
- Dependence on proprietary wearables; integrate later if desired

---

## 1) Core abstractions: frames → reps → sets → sessions

### 1.1 Raw telemetry (frame stream)
VOLTRA emits frames at ~11 Hz with:
- `t` timestamp (ms or seconds)
- `pos` position (cable length / displacement; ideally meters)
- `vel` velocity (m/s)
- `force` force (N)
- `phase` ∈ {eccentric, concentric, isometric/hold, idle}
- (optional) device state flags, rep markers, errors

**Assumption:** Position is monotonic within a phase; velocity sign can define direction, but phase labels are preferable.

### 1.2 Rep segmentation
A rep is a contiguous sequence of frames representing one “work cycle”.

**Rep boundary detection (robust + device-agnostic):**
- Prefer device-provided rep markers if available.
- Otherwise detect using phase transitions:
  - Concentric start: `phase` changes to concentric AND `|vel|` crosses a threshold
  - Concentric end: `phase` leaves concentric OR `vel` approaches 0 for ≥k frames
- Ensure minimum rep duration (e.g., ≥0.3s) to avoid jitter.

**Key implementation detail:** Keep both:
- Rep-level metrics (for modeling)
- Frame slices (for debugging and future feature extraction)

### 1.3 Rep summary metrics (what to compute)
For each rep, compute:

**Kinematics**
- `rom` (range of motion): `pos_max - pos_min` within the rep
- `t_con`, `t_ecc`, `t_hold`: time spent in each phase
- `mean_v_con`: mean concentric velocity (primary VBT metric)
- `peak_v_con`: peak concentric velocity (useful for explosiveness; less stable)
- `mean_v_ecc`: mean eccentric velocity (tempo / control signal)
- `v_profile_shape`: optional, e.g. (time to peak, smoothness)

**Kinetics**
- `mean_force_con`, `peak_force_con`
- `impulse_con = ∫ force dt` over concentric frames
- `work_est = ∫ force * d(pos)` (if position units are meaningful)

**Quality / consistency**
- `rom_ratio = rom / expected_rom` (expected from exercise template or history)
- `ecc_control = t_ecc` or `mean_v_ecc` relative to baseline
- `rep_outlier_flags` (partial rep, pause, etc.)

---

## 2) “Normalized shared layer”: device-agnostic event schema

### 2.1 Why this layer exists
- VOLTRA telemetry becomes **portable** to other devices (bar trackers, other cables)
- Downstream algorithms only depend on normalized fields, not vendor quirks

### 2.2 Canonical entities and relationships
- **ExerciseInstance** → has many **Sets**
- **Set** → has many **Reps**
- **Rep** → derived from many **Frames**

---

## 3) Data models (object models)

Below are suggested **TypeScript-style** interfaces (use as a reference; implement however you like).

```ts
// --- raw frames ---
type Phase = "eccentric" | "concentric" | "hold" | "idle";

interface TelemetryFrame {
  t: number;           // epoch ms or seconds
  pos: number;         // meters (preferred) or device units with declared scale
  vel: number;         // m/s
  force: number;       // Newtons
  phase: Phase;
  // optional extras
  device?: { battery?: number; temp?: number; errorCode?: string };
}

// --- rep summary ---
interface RepSummary {
  repIndex: number;
  tStart: number;
  tEnd: number;

  rom: number;                 // meters
  tCon: number;                // seconds
  tEcc: number;                // seconds
  tHold: number;               // seconds

  meanVCon: number;            // m/s
  peakVCon: number;            // m/s
  meanVEcc?: number;           // m/s

  meanForceCon?: number;       // N
  peakForceCon?: number;       // N
  impulseCon?: number;         // N*s
  workEst?: number;            // Joules (approx)

  // form / quality signals
  romRatio?: number;           // vs expected
  partialRep?: boolean;
  eccRushed?: boolean;
  notes?: string[];
}

// --- set summary ---
interface SetSummary {
  setId: string;
  exerciseId: string;          // canonical exercise (e.g., "bench_press_cable")
  startTime: number;
  endTime: number;

  load: number;                // kg equivalent OR "digital resistance units" with metadata
  repsPlanned?: number;
  repsCompleted: number;
  restBeforeSec?: number;

  reps: RepSummary[];

  // set-level aggregates
  meanV1: number;              // meanVCon of rep1
  meanVBest: number;           // max(meanVCon)
  meanVLast: number;           // meanVCon of last rep
  velLossPct: number;          // (meanV1 - meanVLast) / meanV1
  romMean: number;

  // inferred labels
  inferred: {
    warmup?: boolean;
    topSet?: boolean;
    backoff?: boolean;
    likelyFailure?: boolean;
    likelyAMRAP?: boolean;
    exploration?: boolean;     // profile-building set
  };
}

// --- session summary ---
interface SessionSummary {
  sessionId: string;
  userId: string;
  startTime: number;
  endTime: number;
  timezone: string;

  sets: SetSummary[];

  // high-level metrics (optional)
  volumeByExercise: Record<string, number>;     // load*reps or work estimate
  hardRepsByMuscle?: Record<string, number>;    // see intensity scoring section
}
```

---

## 4) User profile: what to store, what to derive

### 4.1 Principle: store “slow-moving” parameters; derive “fast-moving” states
- Store:
  - Stable estimates (1RM, velocity curve parameters, expected ROM, typical tempo)
  - Model uncertainty / confidence
- Derive on demand:
  - Current “strength today” (readiness-adjusted)
  - Set-by-set fatigue estimate
  - Workout intensity scores

### 4.2 User profile structure
```ts
interface UserProfile {
  userId: string;

  // global baselines
  anthropometrics?: { weightKg?: number; heightCm?: number };
  trainingAge?: "novice" | "intermediate" | "advanced";

  // per exercise or per movement-pattern model
  models: Record<string, ExerciseModel>; // key by exerciseId or patternId

  // optionally: systemic readiness signals from wearables
  readiness?: {
    hrvBaseline?: number;
    sleepBaseline?: number;
    // etc
  };
}

interface ExerciseModel {
  exerciseId: string;

  // strength anchor
  e1RM: {
    value: number;            // kg-equivalent
    updatedAt: number;
    method: "velocity_profile" | "failure_set" | "direct_1rm" | "hybrid";
    uncertainty: number;      // e.g. std dev or CI half-width
  };

  // load-velocity profile parameters
  lvProfile: {
    // simplest: linear model: velocity = a + b*load
    a: number;                // intercept
    b: number;                // slope (negative)
    updatedAt: number;
    uncertainty: { a: number; b: number; corr?: number };
    validLoadRange?: [number, number];
  };

  // last-rep-velocity / proximity-to-failure mapping
  pfModel: {
    // e.g. predict RIR from velocity metrics:
    // RIR ≈ c0 + c1*(v_current / v_fresh_at_load) + c2*(velLossPct) + ...
    params: Record<string, number>;
    updatedAt: number;
    uncertainty?: number;
  };

  // movement constraints / quality baselines
  techniqueBaseline: {
    expectedROM: number;      // meters
    eccTempoSec?: number;     // typical eccentric time
    conTempoSec?: number;
    romTolerancePct: number;  // e.g. 10%
  };

  // recency coverage: where we have data
  coverage: {
    // histogram bins over relative intensity (%e1RM) or load
    bins: Array<{ range: [number, number]; lastSeenAt: number; n: number }>;
  };
}
```

**Why this matters:** when building the next workout, you can:
- Choose loads from `e1RM`
- Predict expected rep velocity from `lvProfile`
- Autoregulate with `pfModel`
- Detect form breakdown with `techniqueBaseline`
- Decide exploration needs using `coverage`

---

## 5) Statistical algorithms: concrete choices (v0 → v2)

### 5.1 Load–Velocity Profiling (LVP)
**Common baseline:** linear relationship between mean concentric velocity and load for a given exercise.

**Model form (per exercise):**
- `v = a + b * load`
- Usually `b < 0` (heavier = slower)

**Fit method options:**
1. **Weighted least squares (WLS)**  
   - Weight fresher / higher-quality points more (low fatigue, good ROM)
2. **Robust regression (Huber / RANSAC)**  
   - Resist outliers from bad reps or sensor glitches
3. **Bayesian linear regression**  
   - Maintain uncertainty explicitly; very nice for exploration decisions

**Data points:**
- Use **first rep** of a set (freshest) preferentially
- Also include warmup singles
- Exclude sets with high velocity loss (fatigue contamination) unless explicitly modeling fatigue

### 5.2 e1RM estimation (without direct max)
Two practical approaches:

**A) LVP + minimal velocity threshold (MVT) approach**
- If you have an estimate of the velocity at 1RM (MVT) for that exercise, solve for load where `v = MVT`:
  - `1RM ≈ (MVT - a) / b`
- **Reality check:** MVT varies by exercise and person; start with defaults, then personalize.

**B) Reps-to-failure models (e1RM formulas)**
- Use classic rep formulas (Epley/Brzycki/etc.) as a fallback:
  - `e1RM = load * (1 + reps/30)` (Epley, rough)
- Prefer when:
  - You have true or near-failure sets
  - Velocity data is missing/unreliable

**Hybrid**
- Treat LVP-based and reps-based e1RM as two estimators; combine by confidence weighting:
  - `e1RM = w1*e1RM_LVP + w2*e1RM_reps`
  - Where `w` depends on recency, load range coverage, fatigue contamination, and uncertainty.

### 5.3 Proximity-to-failure (RIR/RPE) estimation from velocity
**Key idea:** normalize current performance by “fresh expected velocity at this load”.

Compute:
- `v_expected_fresh(load) = a + b*load`
- For a rep: `v_ratio = meanVCon / v_expected_fresh(load)`  
  (≤ 1 means slower than expected, possibly fatigued)
- Set-level: `velLossPct` is a strong fatigue proxy.

**Rules-based v0 (simple and surprisingly useful)**
- Define a few thresholds:
  - If `velLossPct < 10%` → set likely far from failure (RIR high)
  - If `velLossPct 20–30%` → near moderate fatigue
  - If `velLossPct > 40%` → near failure / very high RPE  
  (Exact bands should be configurable and later personalized.)

**Regression v1**
- Fit a small linear model for RIR:
  - `RIR ≈ c0 + c1*v_ratio + c2*velLossPct + c3*(repIndex/repsInSet)`
- Train per user per exercise using:
  - True failure sets (anchor RIR=0 at last rep)
  - Optional user-reported RIR (with low weight for novices)

**State-space / Kalman v2 (optional)**
- Treat “current strength today” as a latent state that drifts within a workout.
- Observations: rep velocities vs expected.
- Update after each set to refine readiness/fatigue.

---

## 6) Fatigue modeling (the missing piece)

### 6.1 Definitions (software-useful)
- **Systemic readiness**: day-to-day global modifier (sleep, stress, etc.)
- **Local fatigue**: within-workout performance decline for a specific pattern/exercise
- **Acute fatigue state**: changes within a workout (minutes)
- **Chronic fatigue (accumulated)**: changes across days/weeks

In v0, focus on **local + acute** from velocity and performance; optionally add systemic later.

### 6.2 Acute fatigue index for a set
A practical fatigue index for a set:
- `FI_set = velLossPct`  
Optionally augmented:
- `FI_set = α*velLossPct + (1-α)*((t_con_last - t_con_first)/t_con_first)` (tempo creep)
- Add penalty for ROM shrinkage:
  - `FI_set += k * max(0, (1 - romRatio))`

### 6.3 Within-workout fatigue state (per exercise)
Maintain an exercise-level fatigue state `F` in [0, 1]:
- Initialize `F = 0` at start of workout (or small value if systemic readiness suggests fatigue)
- Update after each set:
  - `F_new = clamp( λ*F_old + (1-λ)*g(FI_set, intensity, volume) )`
Where:
- `λ` is a smoothing/forgetting factor (e.g., 0.7–0.9)
- `g` increases fatigue more for:
  - higher relative intensity (%e1RM)
  - more hard reps (near failure)
  - shorter rests

**Example functional form (simple):**
- `g = FI_set * (load/e1RM)^p * log(1 + repsCompleted)`
- This makes the same velocity loss more “meaningful” when heavy.

### 6.4 Between-workout fatigue / readiness
Maintain a rolling readiness factor `R_day` (e.g., 0.85–1.05):
- Update from observed “freshness” on first working set:
  - Compare `meanVCon_rep1` to `v_expected_fresh(load)`
  - If consistently slower over multiple sessions, reduce `R_day`
- Smooth with EWMA across days.

**Key point:** This is effectively a “current strength estimate” = `e1RM * R_day`.

---

## 7) Workout intensity scoring (hypertrophy/strength relevance)

You want a way to say: *“today was more intense for quads than last time.”*

### 7.1 “Hard reps” concept (near-failure reps)
A practical proxy:
- Define reps as “hard” if estimated `RIR <= 4` (or `RPE >= 6` on a 10 scale)
- Weight harder reps more:
  - `hardRepWeight = max(0, (4 - RIR_est)) / 4`  (0..1)
- Set intensity score:
  - `Intensity_set = Σ hardRepWeight over reps`

### 7.2 Add load and volume (optional)
To better capture strength vs hypertrophy:
- `Stimulus_set = Intensity_set * (load/e1RM)^q * rom`
  - For hypertrophy emphasis: smaller `q` (e.g., 0.5)
  - For strength emphasis: larger `q` (e.g., 1.5)

### 7.3 Map to muscle groups
Maintain a mapping:
- `exerciseId -> { muscle: fraction }`
Then:
- `Stimulus_muscle += Stimulus_set * fraction`

This allows a daily or weekly “quad stimulus” time series.

---

## 8) Rest time modeling: how to choose rest dynamically

### 8.1 Baseline heuristics
- Strength top sets (heavy): 2–5 min
- Hypertrophy sets (moderate): 1–3 min
- Endurance/light: 30–90 sec

### 8.2 Data-driven rest adjustment (v0)
Use readiness to decide whether rest is sufficient:
- After rest, observe **rep1 velocity** at next set.
- If rep1 velocity is suppressed vs expected and prior set fatigue was high, recommend longer rest:
  - `if v_ratio_rep1 < 0.95 and FI_prev > 0.25: rest += 30–60s`
- If rep1 is normal and user wants efficiency, allow shorter.

### 8.3 Model-based rest (v1)
Fit a per user/per exercise relationship:
- Recovery as a function of rest:
  - `v_ratio_rep1_next ≈ 1 - A*exp(-rest/τ)`
- Learn `τ` (time constant) per exercise pattern.

---

## 9) Exploration strategy: deciding what data you need and how to get it

### 9.1 Coverage model
Track where you have recent data across intensity bins:
- For each exercise:
  - bins over `%e1RM` or load
  - record `lastSeenAt` and number of points
- Define “staleness” threshold (e.g., 21 days)

### 9.2 Exploration decision rule (v0)
If coverage is weak, schedule “exploration sets”:
- Missing low end? Capture in warm-ups (singles at ~30–50% e1RM)
- Missing mid? Include moderate sets (e.g., 6–10 reps at ~60–75%)
- Missing high? Add a heavy single or double (~85–92%) **without failure**

### 9.3 Dedicated profiling session option
If overall uncertainty is high:
- Perform 2–3 singles at each step from ~30% to ~85%
- Short rest early; longer rest as load increases
- Goal: clean data, minimal fatigue

### 9.4 Exploration embedded into programming (preferred UX)
Program alternation:
- Day A: heavier, lower reps (fills high end)
- Day B: moderate, higher reps (fills mid/low and failure-proximity data)
- Warm-ups continuously fill low end

---

## 10) Dynamic tagging (no manual labels required)

You can infer set types from patterns:
- **Warm-up**: low load relative to session peak, low fatigue, short reps
- **Top set**: highest load in exercise block
- **Backoff**: same exercise after top set with load reduction
- **Likely failure**: very high velLossPct and/or final rep velocity collapse + rep termination
- **Exploration**: set done in an under-covered bin by design (planner knows)

**Implementation pattern:**
- Run an “audit pass” after the session to tag sets and update user profile.

---

## 11) Planning the next workout: concrete algorithm

### 11.1 Inputs
- `ExerciseModel` (e1RM + LV profile + pf model + coverage + technique baseline)
- Recent session history (last 1–3 sessions for that exercise)
- Current readiness estimate (`R_day`) and within-session fatigue state if building mid-workout

### 11.2 Outputs
- Planned sets: `(load, target reps or target velocity/RIR, rest guidance)`
- Autoregulation rules: how to adjust if performance deviates

### 11.3 Step-by-step planner
1. **Select goal** (strength vs hypertrophy) → choose target intensity band
2. **Pick target proximity-to-failure**:
   - e.g., hypertrophy: `RIR 1–3`
   - strength: `RIR 2–5` (avoid grinding)
3. **Choose load**:
   - Start from `load = e1RM * R_day * pctTarget`
4. **Predict expected rep1 velocity** from LV profile
5. **Define stop condition**:
   - stop set when `velLossPct` exceeds threshold OR estimated RIR reaches target
6. **After set 1, update within-workout fatigue** `F` and adjust:
   - If rep1 velocity is significantly low: reduce load, extend rest
   - If rep1 velocity is high: small load increase or rep target increase
7. **Coverage-aware exploration**:
   - If coverage gaps exist, choose one set to deliberately land in that bin.

---

## 12) Practical v0 defaults (so the system works immediately)
- Start with:
  - LV profile: fit from warm-ups + first reps of early sets
  - e1RM: reps-based formula until LV has enough data
  - RIR: infer from velocity loss thresholds (simple bands)
  - Fatigue: track per-exercise EWMA of velLossPct scaled by intensity
- Provide “confidence meters”:
  - Profile confidence low → more exploration
  - Confidence high → more exploitation and smoother autoregulation

---

## 13) Implementation checklist (Cursor tasks)

### Phase 1: telemetry pipeline
- [ ] Frame ingestion, storage, replay
- [ ] Rep segmentation and rep summaries
- [ ] Set summaries: velLossPct, meanV1, meanVLast, ROM stats
- [ ] Session summary with per-exercise aggregation

### Phase 2: profile + models
- [ ] ExerciseModel store
- [ ] LV profile fit (WLS + robust)
- [ ] e1RM estimator (hybrid)
- [ ] Coverage tracking (bins + staleness)

### Phase 3: fatigue + intensity
- [ ] Set fatigue index FI_set
- [ ] Within-workout fatigue state F
- [ ] Hard-rep intensity scoring + muscle mapping

### Phase 4: workout planner + autoregulation
- [ ] Next workout generator using e1RM + target RIR + coverage needs
- [ ] In-workout adjustment rules based on rep1 velocity and velLossPct
- [ ] Rest guidance rules + optional recovery curve learning

### Phase 5: optional advanced modeling
- [ ] Bayesian LV profile + uncertainty
- [ ] Regression RIR model using failure anchors
- [ ] State-space “current strength” model

---

## 14) Notes on reusing published VBT tables
- Use as **initial priors/defaults** (especially minimal velocity thresholds and velocity zones).
- Expect variability by device modality (barbell vs cable), exercise, and individual.
- Your system becomes best-in-class when it **personalizes** quickly:
  - 1–2 weeks of normal training + warm-up capture can stabilize LV profile
  - Occasional safe AMRAP/failure sets provide strong anchors

---

## 15) Appendix: recommended computed fields (quick list)

### Per rep
- mean concentric velocity
- peak concentric velocity
- eccentric time and/or mean eccentric velocity
- ROM and ROM ratio
- impulse/work (optional)
- rep quality flags

### Per set
- rep1 velocity, best velocity, last velocity
- velocity loss %
- estimated RIR at last rep
- fatigue index
- “hard reps” count

### Per session
- stimulus score by muscle group
- time efficiency (total rest time, total set time)
- readiness signal (compare expected vs observed rep1 velocities)

---

If you want, the next doc to generate is a **“planner spec”** that enumerates:
- inputs/outputs of each module
- minimal persisted tables (SQLite/Postgres)
- deterministic decision trees for v0 autoregulation
