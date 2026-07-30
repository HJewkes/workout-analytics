/**
 * Set - a collection of reps within a workout.
 *
 * By default Set manages rep boundaries internally from phase transitions:
 * a new rep starts when an eccentric → concentric transition is detected.
 * Callers with an authoritative external rep source (e.g. a device's own
 * rep-completion events) can instead drive boundaries explicitly via
 * {@link AddSampleToSetOptions.repBoundary}, in which case the internal
 * phase-transition heuristic is bypassed.
 */
import {
  type Rep,
  createRep,
  addSampleToRep,
  isInEccentricPhase,
  getRepDuration,
  getRepMeanLoad,
  getRepPeakLoad,
} from '@/models/rep';
import {
  type Phase,
  EMPTY_PHASE,
  rebuildPhaseFromSamples,
  getPhaseMovementDuration,
} from '@/models/phase';
import type { WorkoutSample } from '@/models/sample';
import { MovementPhase } from '@/models/types';
import type { LoadSettings } from '@/models/load';
import { getEffectiveLoad } from '@/models/load';

/**
 * Immutable Set interface.
 */
export interface Set {
  readonly reps: readonly Rep[];
  /** Load configuration for this set. Optional for backward compatibility. */
  readonly loadSettings?: LoadSettings;
}

/**
 * Create an empty set, optionally with load settings.
 */
export function createSet(loadSettings?: LoadSettings): Set {
  return loadSettings ? { reps: [], loadSettings } : { reps: [] };
}

/**
 * Options for {@link addSampleToSet}.
 */
export interface AddSampleToSetOptions {
  /**
   * Override the internal eccentric → concentric boundary detection with an
   * authoritative external rep source:
   *   - `true`  — this sample begins a new rep (creating rep 1 if none exists).
   *   - `false` — this sample belongs to the current rep; do not start a new
   *     one even across a phase transition. Ignored (sample dropped) before the
   *     first rep exists, mirroring the pre-first-rep default.
   *   - `undefined` — use the internal phase-transition detection (default,
   *     byte-identical to the pre-option behaviour).
   */
  repBoundary?: boolean;
}

/**
 * Add sample to set, returns NEW set (immutable).
 * Handles rep boundary detection: by default a new rep starts on an
 * eccentric → concentric transition; pass {@link AddSampleToSetOptions.repBoundary}
 * to drive boundaries from an external (e.g. firmware) rep source instead.
 */
export function addSampleToSet(
  set: Set,
  sample: WorkoutSample,
  options?: AddSampleToSetOptions
): Set {
  const lastRep = set.reps.at(-1);
  const externalBoundary = options?.repBoundary;

  // No rep yet - start rep 1 on an explicit boundary, or (default) on the
  // first CONCENTRIC sample. An explicit `false` keeps ignoring pre-rep samples.
  if (!lastRep) {
    const startsFirstRep =
      externalBoundary === true ||
      (externalBoundary === undefined && sample.phase === MovementPhase.CONCENTRIC);
    if (startsFirstRep) {
      return { ...set, reps: [addSampleToRep(createRep(1), sample)] };
    }
    return set; // Ignore samples before first rep
  }

  // New rep: forced by an external boundary, or (default) the internal
  // eccentric → concentric transition. An explicit `false` pins the sample to
  // the current rep even across a phase transition.
  const startsNewRep =
    externalBoundary === true ||
    (externalBoundary === undefined &&
      isInEccentricPhase(lastRep) &&
      sample.phase === MovementPhase.CONCENTRIC);
  if (startsNewRep) {
    return { ...set, reps: [...set.reps, addSampleToRep(createRep(set.reps.length + 1), sample)] };
  }

  // Add to current rep (IDLE included as hold time)
  return { ...set, reps: [...set.reps.slice(0, -1), addSampleToRep(lastRep, sample)] };
}

/**
 * Trim trailing IDLE samples from a phase.
 */
function trimTrailingIdle(phase: Phase): Phase {
  let lastNonIdleIndex = phase.samples.length - 1;
  while (lastNonIdleIndex >= 0 && phase.samples[lastNonIdleIndex].phase === MovementPhase.IDLE) {
    lastNonIdleIndex--;
  }

  // No trimming needed
  if (lastNonIdleIndex === phase.samples.length - 1) {
    return phase;
  }

  // All samples were IDLE
  if (lastNonIdleIndex < 0) {
    return EMPTY_PHASE;
  }

  // Rebuild from trimmed samples
  return rebuildPhaseFromSamples(phase.samples.slice(0, lastNonIdleIndex + 1));
}

/**
 * Minimum net displacement (metres) a phase's samples must travel from the
 * phase's own first sample before we trust it as REAL concentric motion,
 * rather than a pre-lift cable-engagement/settling artifact.
 *
 * WA-rep1-segmentation: rep 1's concentric phase routinely opens with a run
 * of samples the device/adapter tags CONCENTRIC (nonzero directed velocity)
 * even though the athlete hasn't actually started the lift yet -- cable
 * slack takeup, handle engagement, initial settling. This is the same
 * artifact voltras-mcp's `peakConcentricBaseline` works around for velocity
 * (`src/tools/plan-tools.ts` / `src/state/channel-payloads.ts`: "rep 1 is
 * routinely a cable-engagement artifact with a tiny ROM and a meaninglessly
 * low velocity") -- but that workaround never trusts a value COMPUTED FROM
 * rep 1 (it substitutes the set's peak rep as the baseline instead). That
 * substitution has no analogue here: there's no "other rep" to stand in for
 * rep 1's own concentric span, so segmentation has to re-anchor rep 1's
 * phase directly rather than avoid reading it.
 *
 * 2cm is comfortably below any deliberate concentric drive's first few
 * samples of travel (typical strength-training ROM runs tens of cm), and
 * comfortably above cable slack/sensor jitter, which shows near-zero NET
 * displacement even while individual samples register nonzero velocity.
 */
const LEADING_ARTIFACT_DISPLACEMENT_M = 0.02;

/**
 * Minimum number of leading samples that must stay within
 * `LEADING_ARTIFACT_DISPLACEMENT_M` of the phase's first sample before we
 * call that leading run an engagement artifact rather than just the natural
 * first frame(s) of a real concentric drive. Every real rep's very first
 * sample is, trivially, within the floor of itself (diff 0) -- without this
 * floor a real rep's own opening sample would be misread as "artifact" the
 * moment the very next sample shows genuine travel. Requiring the low-
 * displacement run to last at least 2 samples restricts the cut to an
 * actual settling PERIOD, not a single real starting frame.
 */
const LEADING_ARTIFACT_MIN_SAMPLES = 2;

/**
 * Trim leading samples that haven't yet moved
 * `LEADING_ARTIFACT_DISPLACEMENT_M` from the phase's own first sample.
 *
 * A no-op (returns `phase` unchanged) when fewer than
 * `LEADING_ARTIFACT_MIN_SAMPLES` samples stay within the floor -- a clean
 * rep 1 start is never truncated -- or when NO sample ever clears it, since
 * there is then no real-motion anchor to re-cut to and guessing would be
 * worse than leaving the (short, low-signal) phase as recorded.
 */
function trimLeadingArtifact(phase: Phase): Phase {
  if (phase.samples.length === 0) return phase;

  const anchor = phase.samples[0].position;
  const cutIndex = phase.samples.findIndex(
    (s) => Math.abs(s.position - anchor) >= LEADING_ARTIFACT_DISPLACEMENT_M
  );

  if (cutIndex < LEADING_ARTIFACT_MIN_SAMPLES) return phase;
  return rebuildPhaseFromSamples(phase.samples.slice(cutIndex));
}

/**
 * Finalize set - trims trailing IDLE from the last rep, and a pre-lift
 * engagement artifact from the leading edge of rep 1's concentric phase.
 * Call this when the set is complete (user stopped exercising).
 */
export function completeSet(set: Set): Set {
  if (set.reps.length === 0) return set;

  // Correct rep 1's concentric phase first (WA-rep1-segmentation). Independent
  // of the trailing-IDLE trim below (different rep in general, opposite end
  // of the phase) and a no-op when there's nothing to correct.
  const firstRep = set.reps[0];
  const reps =
    firstRep.repNumber === 1
      ? [
          { ...firstRep, concentric: trimLeadingArtifact(firstRep.concentric) },
          ...set.reps.slice(1),
        ]
      : set.reps;

  const lastRep = reps.at(-1);
  if (!lastRep) return { ...set, reps };

  // Trim from whichever phase is "active" (eccentric if started, else concentric)
  const trimmedRep = isInEccentricPhase(lastRep)
    ? { ...lastRep, eccentric: trimTrailingIdle(lastRep.eccentric) }
    : { ...lastRep, concentric: trimTrailingIdle(lastRep.concentric) };

  return { ...set, reps: [...reps.slice(0, -1), trimmedRep] };
}

// ============================================================
// Derived Helpers (all O(n) on access, no stored state)
// ============================================================

/**
 * Get the number of reps in the set.
 */
export function getSetRepCount(set: Set): number {
  return set.reps.length;
}

/**
 * Get total duration of the set in seconds.
 */
export function getSetDuration(set: Set): number {
  if (set.reps.length === 0) return 0;
  return set.reps.reduce((sum, rep) => sum + getRepDuration(rep), 0);
}

/**
 * Get time under tension (concentric + eccentric movement time, excluding holds).
 */
export function getSetTimeUnderTension(set: Set): number {
  return set.reps.reduce((sum, rep) => {
    const conDuration = getPhaseMovementDuration(rep.concentric);
    const eccDuration = getPhaseMovementDuration(rep.eccentric);
    return sum + conDuration + eccDuration;
  }, 0);
}

// ============================================================
// Load Helpers
// ============================================================

/**
 * Get nominal load for analytics (base weight setting).
 * This is the simple scalar used by volume, e1RM, stimulus, fatigue calculations.
 * Returns 0 if no load settings are present.
 */
export function getSetLoad(set: Set): number {
  if (!set.loadSettings) return 0;
  return getEffectiveLoad(set.loadSettings);
}

/**
 * Get mean per-frame load across all reps (from sample aggregation).
 * Useful for analyzing actual load experienced when chains/eccentric are active.
 * Returns 0 if no load data is present on samples.
 */
export function getSetMeanLoad(set: Set): number {
  if (set.reps.length === 0) return 0;
  let total = 0;
  for (const rep of set.reps) {
    total += getRepMeanLoad(rep);
  }
  return total / set.reps.length;
}

/**
 * Get peak per-frame load across all reps (from sample aggregation).
 * Returns 0 if no load data is present on samples.
 */
export function getSetPeakLoad(set: Set): number {
  let peak = 0;
  for (const rep of set.reps) {
    peak = Math.max(peak, getRepPeakLoad(rep));
  }
  return peak;
}
