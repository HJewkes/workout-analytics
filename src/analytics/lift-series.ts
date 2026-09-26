/**
 * Lift Series - one point per training day for one lift: the top load at the
 * lift's modal reps and the best rep-based e1RM.
 *
 * Pure and load-keyed: it reads load, reps and a day, never velocity, so it
 * serves a logged history with no device data as well as live sessions.
 */

import { estimateE1RMFromReps } from '../vbt/e1rm';

/** Epley overestimates past this many reps (`estimateE1RMFromReps`), so those sets carry no e1RM. */
export const MAX_E1RM_REPS = 12;

/** One working set line: `sets` identical sets of `reps` at `load` on `day`. */
export interface LiftSetInput {
  /** 'YYYY-MM-DD'; the caller decides which local date a session belongs to. */
  day: string;
  load: number;
  reps: number;
  /** How many identical sets the line holds. Defaults to 1. */
  sets?: number;
}

export interface LiftSessionPoint {
  day: string;
  /** Heaviest load carried for at least the series' modal reps; `null` when no set reached them. */
  topLoadAtModal: number | null;
  /** Best Epley e1RM over sets of at most `MAX_E1RM_REPS` reps; `null` when every set was longer. */
  bestE1RM: number | null;
  topLoad: number;
  sets: number;
  totalReps: number;
}

export interface LiftSeries {
  /** The rep count on the most set lines across the whole series; ties go to the lower count. */
  modalReps: number | null;
  /** Oldest first, one per day holding a loaded set. */
  points: LiftSessionPoint[];
}

function setCount(set: LiftSetInput): number {
  return set.sets ?? 1;
}

/** The rep count on the most set lines (not weighted by `sets`); ties go to the lower, heavier standard. */
export function modalRepCount(sets: readonly LiftSetInput[]): number | null {
  const counts = new Map<number, number>();
  for (const set of sets) {
    if (set.reps > 0) counts.set(set.reps, (counts.get(set.reps) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestFrequency = 0;
  for (const [reps, frequency] of [...counts].sort((a, b) => a[0] - b[0])) {
    if (frequency > bestFrequency) {
      best = reps;
      bestFrequency = frequency;
    }
  }
  return best;
}

function maxOrNull(values: readonly number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

function pointOf(
  day: string,
  sets: readonly LiftSetInput[],
  modalReps: number | null
): LiftSessionPoint {
  const atModal = modalReps === null ? [] : sets.filter((set) => set.reps >= modalReps);
  const e1rms = sets
    .filter((set) => set.reps <= MAX_E1RM_REPS)
    .map((set) => estimateE1RMFromReps(set.load, set.reps).e1RM);
  return {
    day,
    topLoadAtModal: maxOrNull(atModal.map((set) => set.load)),
    bestE1RM: maxOrNull(e1rms),
    topLoad: Math.max(...sets.map((set) => set.load)),
    sets: sets.reduce((sum, set) => sum + setCount(set), 0),
    totalReps: sets.reduce((sum, set) => sum + setCount(set) * set.reps, 0),
  };
}

/**
 * One point per training day, oldest first. Sets with no load, no reps or no
 * set count are dropped. "At the modal reps" means at least that many reps: a
 * set carried for more reps at the same load is at least as strong.
 */
export function buildLiftSeries(sets: readonly LiftSetInput[]): LiftSeries {
  const loaded = sets.filter((set) => set.load > 0 && set.reps > 0 && setCount(set) > 0);
  const modalReps = modalRepCount(loaded);
  const byDay = new Map<string, LiftSetInput[]>();
  for (const set of loaded) byDay.set(set.day, [...(byDay.get(set.day) ?? []), set]);
  const points = [...byDay.keys()]
    .sort()
    .map((day) => pointOf(day, byDay.get(day) ?? [], modalReps));
  return { modalReps, points };
}
