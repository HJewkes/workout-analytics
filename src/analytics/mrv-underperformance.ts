/**
 * MRV Underperformance - two-session underperformance detector (VW-91 / B04).
 *
 * Maximum Recoverable Volume is the point past which added volume stops
 * producing adaptation and starts producing only fatigue. The observable
 * signature is not a single bad session — everyone has one — but a session that
 * went backwards and then ANOTHER session that went backwards, at load the
 * lifter had already handled. This module supplies the two halves of that
 * judgement: a single pairwise "did this session underperform its reference"
 * verdict, and the AND-combinator over two consecutive pairs.
 *
 * Like `drift-guard`, everything here is pure and stateless: it derives its
 * answer from the sets it is handed and persists nothing.
 *
 * CONSUMER CONTRACT
 * -----------------
 * Callers MUST:
 *   - Obtain a `DriftGuardVerdict` for the same session pair (store-side:
 *     `checkDriftGuard`) and pass it in. There is no "skip the gate" mode.
 *   - Accept `comparable === false` as an UNCONDITIONAL skip. This module
 *     enforces it by returning `evaluable: false` before it looks at a single
 *     performance number, because a volume drop across two differently-executed
 *     sessions is not evidence of anything.
 * `caveat` carries the drift `reasoning` forward whenever the gate let the
 * comparison through but flagged it — the user is owed the reason.
 *
 * NOT THE SAME MRV AS `VolumeLandmarks` / `classifyWeeklyVolume` in
 * `view-model.ts`. That axis classifies a week's SET COUNT against MEV/MAV/MRV
 * landmarks; this one reads performance decline across two sessions. Shared
 * terminology, no relation, no shared code.
 */

import type { Set } from '@/models/set';
import { getRepMeanVelocity } from '@/models/rep';
import { computeChange } from '@/analytics/types';
import type { DriftGuardVerdict } from '@/analytics/drift-guard';

// =============================================================================
// Types
// =============================================================================

/**
 * A set as this module needs to read it: the analytics `Set` plus the header
 * load it was performed at.
 *
 * `Set` itself carries no `weightLbs` — load lives on `loadSettings`, which the
 * live pipeline does not always populate, while the store's `StoredSet` records
 * the header weight directly. Widening `Set` for one consumer would be a
 * breaking change to every producer; this structural extension lets `StoredSet`
 * pass through unconverted and leaves the model alone.
 */
export interface WeightedSet extends Set {
  /** Header weight for the set, in pounds. Absent on historical/edge rows. */
  readonly weightLbs?: number | undefined;
}

/** One side of a performance comparison: what a group of sets actually did. */
export interface PerformanceSummary {
  /** Median header load across qualifying sets, in pounds. */
  medianSetWeightLbs: number;
  /** Σ `weightLbs × reps.length` over qualifying sets, in pounds. */
  totalVolumeLoadLbs: number;
  /** Median per-rep mean concentric velocity, in m/s. 0 when unmeasured. */
  medianConcentricVelocityMps: number;
  /** Number of qualifying (non-warm-up, load-bearing) sets summarised. */
  workingSetCount: number;
  /** Total reps across qualifying sets. */
  totalReps: number;
}

/** The pairwise verdict: did `current` underperform `baseline`? */
export interface MrvUnderperformanceVerdict {
  /** `false` ⇒ every other field is noise; the question could not be asked. */
  evaluable: boolean;
  /** Only meaningful when `evaluable`. */
  underperformed: boolean;
  /** Signed: (current − baseline) / baseline × 100. Negative = less work. */
  volumeLoadDeltaPct: number;
  /** Signed: (current − baseline) / baseline × 100. Negative = slower. */
  velocityDeltaPct: number;
  /** Human-readable explanation; always populated. */
  reasoning: string;
  /** The drift guard's `reasoning`, when it passed the pair but flagged it. */
  caveat?: string;
  thresholdsUsed: {
    volumeLoadDeclinePct: number;
    velocityDeclinePct: number;
    loadToleranceLbs: number;
  };
}

/**
 * NEEDS FUTURE VALIDATION — same posture as `DRIFT_GUARD_THRESHOLDS`. These are
 * defensible starting points, not calibrated constants, and nothing downstream
 * blocks on them being exactly right.
 */
export const MRV_UNDERPERFORMANCE_THRESHOLDS = {
  /**
   * Volume-load decline that counts as a real drop. RP's own rule is binary
   * ("performance went down"), and 10 % is NOT a relaxation of it — it is the
   * smallest decline this telemetry can resolve. Volume load moves in
   * rep-sized and plate-sized quanta: on a 5×5 at 100 lb one missing rep is
   * already 4 %, and a single plate change is 5–10 %. Below ~10 % a "decline"
   * is as likely to be discretization as it is to be fatigue.
   */
  volumeLoadDeclinePct: 10,
  /**
   * Concentric-velocity decline that counts as a real drop. Same 10 % figure,
   * for a different reason: it sits just outside the ~5–8 % session-to-session
   * variation an unfatigued lifter shows at fixed load, so it reads fatigue
   * rather than noise.
   */
  velocityDeclinePct: 10,
  /**
   * How far median load may fall before the comparison is abandoned as
   * apples-to-oranges. Half a typical 5 lb increment: enough to absorb
   * rounding and a mixed-load session, not enough to let a genuine
   * back-off/deload session masquerade as matched load.
   */
  loadToleranceLbs: 2.5,
} as const;

/** The two-session verdict — the actual B04 signal. */
export interface MrvGuardVerdict {
  /** `true` only when BOTH pairs were evaluable AND both underperformed. */
  mrvFlagged: boolean;
  /** Human-readable explanation; always populated. */
  reasoning: string;
}

// =============================================================================
// Summarisation
// =============================================================================

/** Median of a non-empty array. Copies before sorting. Mirrors `drift-guard`. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reduce a group of sets (one exercise, one session) to what they achieved.
 *
 * A set qualifies only when it recorded a `weightLbs` AND at least one rep.
 * A set with no recorded load cannot contribute to volume load at all, and
 * treating its absent weight as 0 would silently deflate the total — the same
 * failure mode the store's v6 migration removed the `0` sentinel to avoid.
 *
 * A rep contributes to the velocity median only when its mean concentric
 * velocity is positive; 0 is `getRepMeanVelocity`'s "no measurement here", and
 * folding it in drags the median toward a rep that was never performed. Same
 * convention as `summarizeSetsForDrift`.
 *
 * Medians, not means, for load and velocity: one mis-segmented rep or one
 * back-off set should not move the read on its own.
 *
 * Returns `undefined` when no set qualifies — the absence of a read, which the
 * caller must distinguish from a read of zero volume.
 */
export function summarizeSetsForPerformance(
  sets: readonly WeightedSet[]
): PerformanceSummary | undefined {
  const weights: number[] = [];
  const velocities: number[] = [];
  let totalVolumeLoadLbs = 0;
  let totalReps = 0;

  for (const set of sets) {
    const weightLbs = set.weightLbs;
    if (weightLbs === undefined || set.reps.length === 0) continue;

    weights.push(weightLbs);
    totalVolumeLoadLbs += weightLbs * set.reps.length;
    totalReps += set.reps.length;

    for (const rep of set.reps) {
      const velocity = getRepMeanVelocity(rep);
      if (velocity > 0) velocities.push(velocity);
    }
  }

  if (weights.length === 0) return undefined;

  return {
    medianSetWeightLbs: median(weights),
    totalVolumeLoadLbs,
    medianConcentricVelocityMps: velocities.length > 0 ? median(velocities) : 0,
    workingSetCount: weights.length,
    totalReps,
  };
}

// =============================================================================
// Pairwise evaluation
// =============================================================================

/** `"volume load fell 12.4% (limit 10%)"` — shared phrasing for both metrics. */
function describeDecline(label: string, pct: number, limit: number): string {
  return `${label} fell ${Math.abs(pct).toFixed(1)}% (limit ${Number(limit.toFixed(2))}%)`;
}

/**
 * Decide whether `current` underperformed `baseline`.
 *
 * `driftVerdict` is REQUIRED and is checked FIRST — see the CONSUMER CONTRACT
 * above. The load-decreased gate is checked second: if the lifter simply put
 * less weight on the bar, fewer reps and less volume load are the expected
 * consequence of that choice, not evidence that they have exceeded MRV.
 * Only once both gates pass is a performance number even computed.
 */
export function evaluateMrvUnderperformance(
  baseline: PerformanceSummary,
  current: PerformanceSummary,
  driftVerdict: DriftGuardVerdict,
  options?: Partial<typeof MRV_UNDERPERFORMANCE_THRESHOLDS>
): MrvUnderperformanceVerdict {
  const volumeLimit =
    options?.volumeLoadDeclinePct ?? MRV_UNDERPERFORMANCE_THRESHOLDS.volumeLoadDeclinePct;
  const velocityLimit =
    options?.velocityDeclinePct ?? MRV_UNDERPERFORMANCE_THRESHOLDS.velocityDeclinePct;
  const loadToleranceLbs =
    options?.loadToleranceLbs ?? MRV_UNDERPERFORMANCE_THRESHOLDS.loadToleranceLbs;

  const thresholdsUsed = {
    volumeLoadDeclinePct: volumeLimit,
    velocityDeclinePct: velocityLimit,
    loadToleranceLbs,
  };

  if (!driftVerdict.comparable) {
    return {
      evaluable: false,
      underperformed: false,
      volumeLoadDeltaPct: 0,
      velocityDeltaPct: 0,
      reasoning: `drift guard refused the comparison (${driftVerdict.reasoning}) — underperformance is not assessable`,
      thresholdsUsed,
    };
  }

  const loadDrop = baseline.medianSetWeightLbs - current.medianSetWeightLbs;
  if (loadDrop > loadToleranceLbs) {
    return {
      evaluable: false,
      underperformed: false,
      volumeLoadDeltaPct: 0,
      velocityDeltaPct: 0,
      reasoning: `median load dropped ${loadDrop.toFixed(1)} lbs (tolerance ${Number(loadToleranceLbs.toFixed(2))} lbs) — fewer reps at lighter load is expected, not underperformance`,
      thresholdsUsed,
    };
  }

  const volumeLoadDeltaPct = computeChange(
    baseline.totalVolumeLoadLbs,
    current.totalVolumeLoadLbs
  ).percentChange;
  const velocityDeltaPct = computeChange(
    baseline.medianConcentricVelocityMps,
    current.medianConcentricVelocityMps
  ).percentChange;

  const declines: string[] = [];
  if (volumeLoadDeltaPct <= -volumeLimit) {
    declines.push(describeDecline('volume load', volumeLoadDeltaPct, volumeLimit));
  }
  if (velocityDeltaPct <= -velocityLimit) {
    declines.push(describeDecline('concentric velocity', velocityDeltaPct, velocityLimit));
  }

  const verdict: MrvUnderperformanceVerdict = {
    evaluable: true,
    underperformed: declines.length > 0,
    volumeLoadDeltaPct,
    velocityDeltaPct,
    reasoning:
      declines.length > 0
        ? `${declines.join(' and ')} at matched-or-greater load`
        : 'volume load and concentric velocity held at matched-or-greater load',
    thresholdsUsed,
  };

  // The gate let this through but was not happy about it; carry the reason.
  if (driftVerdict.flagged) {
    return { ...verdict, caveat: driftVerdict.reasoning };
  }
  return verdict;
}

// =============================================================================
// Two-session combination
// =============================================================================

/**
 * Combine two consecutive pairwise verdicts into the B04 signal.
 *
 * Pure AND: one bad session is a bad session, two in a row is a pattern. An
 * inconclusive pair never yields `mrvFlagged`, and says so — a caller that saw
 * a bare `false` would otherwise read "performance is fine" from what was
 * actually "we could not look".
 */
export function evaluateMrvGuard(
  priorPair: MrvUnderperformanceVerdict,
  currentPair: MrvUnderperformanceVerdict
): MrvGuardVerdict {
  const notEvaluable: string[] = [];
  if (!priorPair.evaluable) notEvaluable.push(`prior pair (${priorPair.reasoning})`);
  if (!currentPair.evaluable) notEvaluable.push(`current pair (${currentPair.reasoning})`);

  if (notEvaluable.length > 0) {
    return {
      mrvFlagged: false,
      reasoning: `inconclusive — ${notEvaluable.join(' and ')}`,
    };
  }

  if (priorPair.underperformed && currentPair.underperformed) {
    return {
      mrvFlagged: true,
      reasoning: `two consecutive sessions underperformed: ${priorPair.reasoning}, then ${currentPair.reasoning}`,
    };
  }

  return {
    mrvFlagged: false,
    reasoning:
      priorPair.underperformed || currentPair.underperformed
        ? 'only one of the two sessions underperformed — a single down session is not an MRV signal'
        : 'neither session underperformed',
  };
}
