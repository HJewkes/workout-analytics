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
  options?: AddSampleToSetOptions,
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
 * Finalize set - trims trailing IDLE from last rep.
 * Call this when the set is complete (user stopped exercising).
 */
export function completeSet(set: Set): Set {
  const lastRep = set.reps.at(-1);
  if (!lastRep) return set;

  // Trim from whichever phase is "active" (eccentric if started, else concentric)
  const trimmedRep = isInEccentricPhase(lastRep)
    ? { ...lastRep, eccentric: trimTrailingIdle(lastRep.eccentric) }
    : { ...lastRep, concentric: trimTrailingIdle(lastRep.concentric) };

  return { ...set, reps: [...set.reps.slice(0, -1), trimmedRep] };
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
