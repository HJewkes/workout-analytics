/**
 * View-model derivations — exact, unrounded set/exercise metrics for rendering
 * workout views (dashboard, mobile).
 *
 * These compose existing WA math into the handful of derivations a set/exercise
 * view needs (RPE, best e1RM, tempo, per-rep velocity, weight deviation, volume
 * status). Every function returns REAL, precise values — and `null` when there
 * is genuinely no signal (a data-validity judgement WA owns). No display
 * rounding, banding, unit conversion, or text formatting crosses this boundary:
 * those are presentation decisions the consuming surface makes, so one view can
 * round while another (or a hover) shows the exact value.
 *
 * NDA: reads WA models only; no protocol bytes / frames / command codes.
 */
import { getRepMeanVelocity, getRepPeakVelocity } from '@/models/rep';
import { getPhaseHoldDuration, getPhaseMovementDuration } from '@/models/phase';
import type { Set } from '@/models/set';
import { getSetVelocityLossPct } from '@/analytics/set-analytics';
import { estimateSetRIR } from '@/analytics/fatigue';
import { estimateE1RMFromReps } from '@/vbt/e1rm';

// =============================================================================
// RPE
// =============================================================================

/**
 * Estimated set RPE (10 − RIR) from velocity loss — EXACT, unrounded. Returns
 * `null` when there is not enough signal to estimate: fewer than two reps, or
 * velocity loss is not derivable (no concentric movement samples), or WA cannot
 * produce a finite RIR. Without that gate `estimateSetRIR` returns a misleading
 * floor rather than signalling "unknown". Callers round/band for display (RPE's
 * conventional 0.5 granularity and its color bands are presentation concerns).
 */
export function estimateSetRpe(set: Set): number | null {
  if (set.reps.length < 2) return null;
  if (!Number.isFinite(getSetVelocityLossPct(set))) return null;
  const { rpe } = estimateSetRIR(set);
  return Number.isFinite(rpe) ? rpe : null;
}

// =============================================================================
// Velocity
// =============================================================================

/**
 * Per-rep peak concentric velocity across the set — EXACT, in the SAME unit the
 * samples were recorded in (WA is unit-agnostic; unit normalization is the
 * caller's, since only the data source knows whether samples are m/s or mm/s).
 * `null` entries for reps whose peak velocity is unavailable, so the caller can
 * render "no data" rather than a fabricated zero.
 */
export function getSetRepPeakVelocities(set: Set): Array<number | null> {
  return set.reps.map((rep) => finiteOrNull(getRepPeakVelocity(rep)));
}

/**
 * Per-rep MEAN concentric velocity across the set — EXACT, in the SAME unit the
 * samples were recorded in (WA is unit-agnostic). `null` entries for reps whose
 * mean velocity is unavailable, so the caller can render "no data" rather than a
 * fabricated zero.
 *
 * This is the mean-velocity sibling of `getSetRepPeakVelocities`, carrying the
 * same finite-or-null gap contract. It is the correct feed for velocity-ZONE
 * classification (`categorizeVelocity`) and the velocity-loss reference, both of
 * which are defined on mean concentric velocity (WA-D02) — peak must not be fed
 * to a mean-velocity scale.
 */
export function getSetRepMeanVelocities(set: Set): Array<number | null> {
  return set.reps.map((rep) => finiteOrNull(getRepMeanVelocity(rep)));
}

// =============================================================================
// Velocity-loss verdict (canonical banding)
// =============================================================================

/** Autoregulation verdict banded from a set's velocity loss. */
export type VelocityLossVerdict = 'productive' | 'threshold' | 'stop';

/**
 * Band a set's velocity-loss percentage into an autoregulation verdict — the
 * SINGLE canonical source consumers use instead of hand-rolling their own
 * cut-points. Below the threshold the set is `productive` (keep going); at/above
 * VL20 it has reached the autoregulation `threshold` (moderate fatigue — the
 * stop-consideration band); at/above VL30 the verdict is `stop`.
 *
 * `null` loss — fewer than two reps, so no loss is derivable yet — bands as
 * `productive`: a set that has not yet shown decline is not curtailed. (This
 * matches the dashboard's `verdictFromLoss`, whose semantics this function is
 * the canonical replacement for.)
 *
 * Thresholds: **VL20 (threshold) / VL30 (stop)**. The autoregulation spec
 * (`voltra_vbt_autoregulation_spec.md` §5.3) brackets "near moderate fatigue" at
 * 20–30% velocity loss; these two cut-points are the edges of that band. The
 * spec does not state an explicit three-way productive/threshold/stop banding,
 * so VL20/VL30 is the documented default (consistent with §5.3), not a
 * spec-verbatim triple. It converges the two divergent consumer forks — the
 * dashboard's `verdictFromLoss` (20/30) and `toAutoRegStatus` (20/28) — onto one
 * WA-owned definition. WA owns the thresholds; consumers own the labels/colors.
 *
 * This is the FIRST SLICE of the view-model reorg: the canonical banding
 * function only. The full one-consumer-door `/view` subpath plus the
 * `no-restricted-imports` lint that forbids re-hand-rolling banding is the VW-64
 * epic.
 */
export function velocityLossVerdict(lossPct: number | null): VelocityLossVerdict {
  if (lossPct === null) return 'productive';
  if (lossPct >= 30) return 'stop';
  if (lossPct >= 20) return 'threshold';
  return 'productive';
}

// =============================================================================
// Tempo
// =============================================================================

/**
 * Rep cadence as `[eccentric, pauseBottom, concentric, pauseTop]` seconds —
 * EXACT, unrounded — from the most recent rep in the set that carries real
 * phase timing. `null` when no rep has timing yet (an all-zero cadence means
 * "not captured", not "instant", so we signal absence). Callers round for
 * display.
 */
export function getSetTempoSeconds(set: Set): [number, number, number, number] | null {
  for (let i = set.reps.length - 1; i >= 0; i--) {
    const rep = set.reps[i];
    const tempo: [number, number, number, number] = [
      getPhaseMovementDuration(rep.eccentric),
      getPhaseHoldDuration(rep.eccentric),
      getPhaseMovementDuration(rep.concentric),
      getPhaseHoldDuration(rep.concentric),
    ];
    if (tempo.some((v) => v > 0)) return tempo;
  }
  return null;
}

// =============================================================================
// Estimated 1RM
// =============================================================================

/** One set's load + rep count for e1RM aggregation. Load unit is arbitrary (in = out). */
export interface E1RMSetInput {
  /** Working load for the set; `null` when unknown (the set is skipped). */
  load: number | null;
  /** Reps completed in the set. */
  reps: number;
}

/**
 * Best (maximum) estimated 1RM across an exercise's sets — EXACT, unrounded. A
 * live "projected 1RM" that firms up as reps accumulate: the rep-based Epley
 * estimate per set, maxed. `null` until at least one set has both a positive
 * load and ≥1 rep. Unit-agnostic (load in = load out); callers round for
 * display.
 */
export function bestE1RMAcrossSets(sets: ReadonlyArray<E1RMSetInput>): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.load == null || s.load <= 0 || s.reps < 1) continue;
    const est = estimateE1RMFromReps(s.load, s.reps).e1RM;
    if (Number.isFinite(est) && (best === null || est > best)) best = est;
  }
  return best;
}

/**
 * True when a live e1RM beats the prior historical best — a new PR. Requires a
 * historical baseline: the first-ever session of an exercise is NOT flagged
 * (nothing to beat), so a true result means "you just went past your record".
 */
export function isNewE1RM(current: number | null | undefined, historyBest: number | null): boolean {
  return current != null && historyBest != null && current > historyBest;
}

// =============================================================================
// Prescription deviation
// =============================================================================

/**
 * Signed fraction the actual working weight deviates from the prescribed weight
 * — EXACT ratio (e.g. `0.09` = 9% heavier), positive = heavier than planned.
 * `null` when either weight is missing or the prescription is non-positive, so
 * "no prescription" renders nothing rather than a spurious "on plan". Callers
 * scale to a percentage and round for display.
 */
export function weightDeviationRatio(
  actual: number | null,
  prescribed: number | null | undefined
): number | null {
  if (actual == null || prescribed == null || prescribed <= 0) return null;
  return (actual - prescribed) / prescribed;
}

// =============================================================================
// Weekly volume status
// =============================================================================

/** Weekly training-volume landmarks (effective sets per week) for a muscle group. */
export interface VolumeLandmarks {
  /** Minimum Effective Volume — below this, not enough to grow. */
  mev: number;
  /** Maximum Adaptive Volume — the top of the productive band. */
  mav: number;
  /** Maximum Recoverable Volume — at/above this, beyond recoverable. */
  mrv: number;
}

/** Weekly-volume status classification. */
export type VolumeStatusName = 'under' | 'maintenance' | 'productive' | 'over';

/**
 * Classify weekly effective sets against MEV/MAV/MRV landmarks: below MEV is
 * `under`, MEV–MAV `maintenance`, MAV–MRV `productive` (the growth sweet spot),
 * at/above MRV `over`. Pure classification — the landmark table and the
 * labels/colors live in the consuming design system, not here.
 */
export function classifyWeeklyVolume(sets: number, landmarks: VolumeLandmarks): VolumeStatusName {
  if (sets < landmarks.mev) return 'under';
  if (sets < landmarks.mav) return 'maintenance';
  if (sets < landmarks.mrv) return 'productive';
  return 'over';
}

// =============================================================================
// Internal
// =============================================================================

function finiteOrNull(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
