/**
 * Effort resolver types — the ONE contract the live wall, the rep strip, the
 * RPE readout and the ending cue all read (VW-518, VW-448).
 *
 * Two halves. `EffortSetContext` is everything the rule needs that the rule
 * cannot know: the goal the prescription states, the guard that may cue before
 * it, and the lifter's fitted RIR-velocity line when one is trusted. It is
 * PINNED at set start by the caller and is plain JSON — no store handle, no
 * clock, no callbacks — so a cloud service can build it and a browser or a
 * React Native shell can run the rule over it unchanged. `SetEffort` is the
 * single answer: one band per rep, at most one cue, and the markers a chart
 * draws.
 *
 * NO LIFTER-FACING STRINGS cross this boundary. Every field is an id, a number
 * or a typed union; wording belongs to the surface that speaks it. That is why
 * a marker carries `condition`, `targetRpe`, `lossPct` and `repsLow`/`repsHigh`
 * rather than a rendered label.
 *
 * NDA: velocities and rep counts only; no protocol bytes / frames / command codes.
 */

// =============================================================================
// Context — pinned at set start
// =============================================================================

/** Movement family, carried for the record; the resolver reads no class table. */
export type EffortExerciseClass = 'lower_compound' | 'upper_compound' | 'single_joint' | 'unknown';

export type EffortIntent = 'strength' | 'hypertrophy' | 'power';

/** Where a goal came from. The first two are prescriptions, the rest typed watches. */
export type EffortGoalSource = 'plan' | 'last_time' | 'explicit' | 'set_intent' | 'plan_intent';

/** Where a resolved velocity-loss number came from (VW-266 precedence). */
export type EffortLossSource = 'explicit' | 'set_intent' | 'plan_intent';

/** Where a marker's number came from; a goal source, or the policy's default cap. */
export type EffortMarkerSource = EffortGoalSource | 'policy_default';

/**
 * What the prescription asks the set to reach. Rep ranges are the common case;
 * a velocity-loss goal is rare.
 */
export type EffortGoal =
  | { kind: 'rep_range'; repsLow: number; repsHigh: number; source: EffortGoalSource }
  | {
      kind: 'target_rpe';
      targetRpe: number;
      repsLow: number | null;
      repsHigh: number | null;
      source: EffortGoalSource;
    }
  | { kind: 'velocity_loss'; lossPct: number; source: EffortGoalSource };

/** The inputs a guard condition can be built from. A set has at most one guard. */
export interface EffortGuardInput {
  /**
   * The row's stated RPE cap. `null` falls back to `EffortPolicy.defaultEffortCapRpe`,
   * so a trusted profile always has an effort cap to guard with.
   */
  effortCapRpe: number | null;
  effortCapSource: 'plan' | 'policy_default' | null;
  /** A resolved loss percent (0-100), or `null` when none resolved. Never a wall default. */
  lossPct: number | null;
  lossSource: EffortLossSource | null;
}

/**
 * The lifter's fitted RIR-velocity line for this exercise, supplied ONLY when
 * the caller trusts it. Supplying one is what puts the set in tier b; the trust
 * decision itself (fit error, anchors, held-out check, freshness) is the
 * caller's and lives beside the fit.
 */
export interface EffortProfile {
  /** Fitted mean concentric velocity at RIR 0. */
  interceptMps: number;
  /** Positive by construction; a non-positive slope degrades the set to tier a. */
  slopeMpsPerRir: number;
  /** Fit error in reps, the half-width source for `EffortRep.rirRange`. */
  rirErrorReps: number;
  /** The RIR span the line was fitted over; a reading outside it is low confidence. */
  rirRange: readonly [number, number];
  /** The load/e1RM span the line was fitted over; outside it the profile is not used. */
  intensityRange: readonly [number, number];
  modelVersion: string;
}

/** One finalized rep of the set. Velocity is MEAN concentric velocity, never peak. */
export interface EffortRepInput {
  repNumber: number;
  meanVelocityMps: number;
  /** Caller-decided. An ineligible rep gets no band and drives no condition. */
  eligible: boolean;
}

export interface EffortSetContext {
  /** Carried for the record; no class-keyed number is read by the resolver. */
  exerciseClass: EffortExerciseClass;
  /** Carried for the record; the numbers it drives are resolved upstream (VW-266). */
  intent: EffortIntent | null;
  goal: EffortGoal | null;
  guard: EffortGuardInput;
  /** The loss percent the tier a band scale is cut into thirds from. */
  bandReferenceLossPct: number;
  /** Load over estimated 1RM; `null` when unknown. Checked against the fitted span. */
  relativeIntensity: number | null;
  /** False for isokinetic, chains, damper or eccentric overload. */
  constantLoad: boolean;
  /** False for ballistic pulls. */
  velocitySignalValid: boolean;
  profile: EffortProfile | null;
}

// =============================================================================
// Result
// =============================================================================

export type EffortBasis = 'profile' | 'velocity_loss_table' | 'none';
export type EffortBand = 0 | 1 | 2 | 3;
export type EffortConfidence = 'high' | 'low';

/** Why the set is not on a trusted profile. `null` when it is. */
export type EffortDegradedReason =
  | 'non_constant_load'
  | 'velocity_signal_invalid'
  | 'no_profile'
  | 'profile_slope_not_positive'
  | 'intensity_out_of_domain';

export type CueReason = 'reps' | 'effort' | 'velocity_loss';
export type CueState = 'working' | 'in_range' | 'approaching' | 'reached' | 'past';

export interface EffortRep {
  repNumber: number;
  /** The measured mean velocity, passed through untouched. Bar height. */
  velocityMps: number;
  /** Loss from the fastest eligible rep up to and including this one. */
  lossPct: number | null;
  rir: number | null;
  rirRange: { low: number; high: number } | null;
  /** `10 - rir`, or null. Never derived from loss. Withheld entirely in tier a. */
  rpe: number | null;
  band: EffortBand | null;
  confidence: EffortConfidence | null;
  cueState: CueState;
  /** True on exactly one rep per set, or on none. */
  cueFiredHere: boolean;
}

/**
 * A line on the chart. `axis` says which one: a rep-axis marker is a target zone
 * over rep slots, a velocity-axis marker is a horizontal line.
 */
export interface EffortMarker {
  role: 'goal' | 'guard';
  condition: CueReason;
  axis: 'rep' | 'velocity';
  repsLow: number | null;
  repsHigh: number | null;
  /** Null before a best rep exists for a loss line. */
  velocityMps: number | null;
  lossPct: number | null;
  targetRpe: number | null;
  /** The marker's OWN colour: the effort it targets. Null = neutral ink. */
  band: EffortBand | null;
  source: EffortMarkerSource;
  reached: boolean;
  reachedAtRep: number | null;
}

export interface EffortCue {
  state: CueState;
  /** What fired first. Latched: set once, never revised. */
  reason: CueReason | null;
  reachedAtRep: number | null;
  repsPastCue: number;
  /** Conditions that became true at or after the latch. Recorded, never spoken. */
  alsoTrue: ReadonlyArray<{ reason: CueReason; atRep: number }>;
  /** Tier a fallback for a `target_rpe` goal: what is really cueing. Null otherwise. */
  fallback: 'reps' | 'velocity_loss' | 'none' | null;
}

export interface SetEffort {
  basis: EffortBasis;
  policyId: string;
  policyVersion: string;
  bandMeaning: 'effort' | 'velocity_loss' | null;
  /** Velocities where bands 1, 2 and 3 start, for the chart's reference lines. */
  bandEdgesMps: readonly [number | null, number | null, number | null];
  /** Echoed, so every reader names the same goal. */
  goal: EffortGoal | null;
  reps: readonly EffortRep[];
  markers: { goal: EffortMarker | null; guard: EffortMarker | null };
  cue: EffortCue;
  set: { rir: number | null; rpe: number | null; band: EffortBand | null };
  confidence: EffortConfidence | null;
  degradedReason: EffortDegradedReason | null;
}
