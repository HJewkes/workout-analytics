/**
 * `resolveSetEffort` — one answer for the hero chart, the rep strip, the RPE
 * readout and the ending cue (VW-518, VW-448 amendment s.4-s.5).
 *
 * The rule, in four sentences. A set is judged against a GOAL (a rep range, a
 * target RPE, or a velocity-loss percent) and at most one GUARD, evaluated
 * after every finalized eligible rep. The FIRST condition to become true fires
 * the cue and LATCHES; a tie goes to the goal, and a condition that becomes
 * true later is recorded in `cue.alsoTrue` and stays silent. Bar height is the
 * measured mean velocity, passed through untouched; bar COLOUR is absolute
 * effort, which only a trusted profile can read, so RPE is withheld entirely
 * until one exists. Nothing here ends a set: the cue is advice, and reps after
 * the latch are reported as `past`.
 *
 * Pure: no store handle, no clock, no I/O, no randomness. The same context and
 * reps always give the same answer, and resolving a prefix of the reps latches
 * on the same rep as resolving the whole set.
 *
 * NDA: velocities and rep counts only; no protocol bytes / frames / command codes.
 */
import { EFFORT_POLICY, type EffortPolicy } from '@/effort/policy';
import type {
  CueReason,
  CueState,
  EffortBand,
  EffortBasis,
  EffortConfidence,
  EffortDegradedReason,
  EffortMarker,
  EffortMarkerSource,
  EffortProfile,
  EffortRep,
  EffortRepInput,
  EffortSetContext,
  SetEffort,
} from '@/effort/types';

/** One condition the set is judged against, goal or guard, in resolved numbers. */
interface ConditionSpec {
  reason: CueReason;
  repsLow: number | null;
  repsHigh: number | null;
  targetRpe: number | null;
  lossPct: number | null;
  source: EffortMarkerSource;
}

/** What one eligible rep reads, before any cue state is attached. */
interface RepReading {
  repNumber: number;
  lossPct: number | null;
  rir: number | null;
  rirRange: { low: number; high: number } | null;
  rpe: number | null;
  band: EffortBand | null;
  confidence: EffortConfidence | null;
}

// =============================================================================
// Tier
// =============================================================================

function intensityInDomain(
  profile: EffortProfile,
  relativeIntensity: number | null,
  policy: EffortPolicy
): boolean {
  if (relativeIntensity === null) return true;
  const [low, high] = profile.intensityRange;
  const slack = policy.intensityDomainTolerance;
  return relativeIntensity >= low - slack && relativeIntensity <= high + slack;
}

/**
 * Which rule answers this set. A non-constant load or an invalid velocity
 * signal means no band and no velocity-derived condition at all; a missing,
 * broken or out-of-domain profile drops the set to the velocity-loss tier.
 */
function resolveBasis(
  context: EffortSetContext,
  policy: EffortPolicy
): { basis: EffortBasis; degradedReason: EffortDegradedReason | null } {
  if (!context.constantLoad) return { basis: 'none', degradedReason: 'non_constant_load' };
  if (!context.velocitySignalValid) {
    return { basis: 'none', degradedReason: 'velocity_signal_invalid' };
  }
  const profile = context.profile;
  if (profile === null) return { basis: 'velocity_loss_table', degradedReason: 'no_profile' };
  if (!(profile.slopeMpsPerRir > 0)) {
    return { basis: 'velocity_loss_table', degradedReason: 'profile_slope_not_positive' };
  }
  if (!intensityInDomain(profile, context.relativeIntensity, policy)) {
    return { basis: 'velocity_loss_table', degradedReason: 'intensity_out_of_domain' };
  }
  return { basis: 'profile', degradedReason: null };
}

// =============================================================================
// The fitted line and the bands
// =============================================================================

function rirForVelocity(profile: EffortProfile, velocityMps: number): number {
  return Math.max(0, (velocityMps - profile.interceptMps) / profile.slopeMpsPerRir);
}

function velocityForRir(profile: EffortProfile, rir: number): number {
  return profile.interceptMps + profile.slopeMpsPerRir * rir;
}

/** Absolute effort: band 0 is productive work, band 3 is at failure. */
function bandForRir(rir: number, policy: EffortPolicy): EffortBand {
  const [green, yellow, orange] = policy.rirCuts;
  const eps = policy.conditionEpsilon;
  if (rir + eps >= green) return 0;
  if (rir + eps >= yellow) return 1;
  if (rir + eps >= orange) return 2;
  return 3;
}

/** Tier a: thirds of the set's reference loss. Means "slowing", never effort. */
function bandForLoss(
  lossPct: number | null,
  referencePct: number,
  policy: EffortPolicy
): EffortBand | null {
  if (lossPct === null || !(referencePct > 0)) return null;
  const eps = policy.conditionEpsilon;
  const [first, second, third] = policy.lossBandFractions;
  if (lossPct + eps >= third * referencePct) return 3;
  if (lossPct + eps >= second * referencePct) return 2;
  if (lossPct + eps >= first * referencePct) return 1;
  return 0;
}

function bandEdges(
  context: EffortSetContext,
  basis: EffortBasis,
  bestVelocityMps: number | null,
  policy: EffortPolicy
): readonly [number | null, number | null, number | null] {
  const profile = context.profile;
  if (basis === 'profile' && profile !== null) {
    const [a, b, c] = policy.rirCuts;
    return [velocityForRir(profile, a), velocityForRir(profile, b), velocityForRir(profile, c)];
  }
  const reference = context.bandReferenceLossPct;
  if (basis !== 'velocity_loss_table' || bestVelocityMps === null || !(reference > 0)) {
    return [null, null, null];
  }
  const [a, b, c] = policy.lossBandFractions;
  const edge = (fraction: number) => bestVelocityMps * (1 - (fraction * reference) / 100);
  return [edge(a), edge(b), edge(c)];
}

// =============================================================================
// Conditions
// =============================================================================

function repsSpec(
  repsLow: number | null,
  repsHigh: number | null,
  targetRpe: number | null,
  source: EffortMarkerSource
): ConditionSpec {
  return { reason: 'reps', repsLow, repsHigh, targetRpe, lossPct: null, source };
}

/**
 * The condition the goal kind names. A `target_rpe` goal without a trusted
 * profile falls back in order: the top of the rep range, then a resolved loss
 * number, then no cue — and keeps `targetRpe` on the marker so a label can say
 * what is really cueing.
 */
function goalCondition(context: EffortSetContext, basis: EffortBasis): ConditionSpec | null {
  const goal = context.goal;
  if (goal === null) return null;
  if (goal.kind === 'rep_range') {
    return repsSpec(goal.repsLow, goal.repsHigh, null, goal.source);
  }
  if (goal.kind === 'velocity_loss') {
    if (basis === 'none') return null;
    const { lossPct, source } = goal;
    return {
      reason: 'velocity_loss',
      repsLow: null,
      repsHigh: null,
      targetRpe: null,
      lossPct,
      source,
    };
  }
  if (basis === 'profile') {
    const { repsLow, repsHigh, targetRpe, source } = goal;
    return { reason: 'effort', repsLow, repsHigh, targetRpe, lossPct: null, source };
  }
  return targetRpeFallback(context, basis);
}

function targetRpeFallback(context: EffortSetContext, basis: EffortBasis): ConditionSpec | null {
  const goal = context.goal;
  if (goal?.kind !== 'target_rpe') return null;
  const repsHigh = goal.repsHigh ?? goal.repsLow;
  if (repsHigh !== null) {
    return repsSpec(goal.repsLow ?? repsHigh, repsHigh, goal.targetRpe, goal.source);
  }
  const { lossPct, lossSource } = context.guard;
  if (basis !== 'none' && lossPct !== null && lossSource !== null) {
    return {
      reason: 'velocity_loss',
      repsLow: null,
      repsHigh: null,
      targetRpe: goal.targetRpe,
      lossPct,
      source: lossSource,
    };
  }
  return null;
}

function effortGuard(context: EffortSetContext, policy: EffortPolicy): ConditionSpec {
  const targetRpe = context.guard.effortCapRpe ?? policy.defaultEffortCapRpe;
  const source = context.guard.effortCapSource ?? 'policy_default';
  return { reason: 'effort', repsLow: null, repsHigh: null, targetRpe, lossPct: null, source };
}

function lossGuard(context: EffortSetContext, explicitOnly: boolean): ConditionSpec | null {
  const { lossPct, lossSource } = context.guard;
  if (lossPct === null || lossSource === null) return null;
  if (explicitOnly && lossSource !== 'explicit') return null;
  return {
    reason: 'velocity_loss',
    repsLow: null,
    repsHigh: null,
    targetRpe: null,
    lossPct,
    source: lossSource,
  };
}

/**
 * The one extra condition that may cue before the goal. With a trusted profile
 * effort guards, except that a typed loss percent takes the slot (OWNER: effort
 * replaces an INTENT-derived loss guard; a typed one still guards). Without a
 * profile only a resolved loss number can guard, because RPE is withheld.
 */
function guardCondition(
  context: EffortSetContext,
  basis: EffortBasis,
  goal: ConditionSpec | null,
  policy: EffortPolicy
): ConditionSpec | null {
  if (goal === null || basis === 'none') return null;
  if (basis !== 'profile') {
    // A tier a `target_rpe` goal reaches a loss number as its own fallback, not as a guard.
    return context.goal?.kind === 'rep_range' ? lossGuard(context, false) : null;
  }
  if (goal.reason === 'effort') return lossGuard(context, true);
  if (goal.reason === 'velocity_loss') return effortGuard(context, policy);
  return lossGuard(context, true) ?? effortGuard(context, policy);
}

function conditionMet(spec: ConditionSpec, reading: RepReading, policy: EffortPolicy): boolean {
  const eps = policy.conditionEpsilon;
  if (spec.reason === 'reps') {
    return spec.repsHigh !== null && reading.repNumber >= spec.repsHigh;
  }
  if (spec.reason === 'effort') {
    return (
      spec.targetRpe !== null && reading.rir !== null && reading.rir <= 10 - spec.targetRpe + eps
    );
  }
  return spec.lossPct !== null && reading.lossPct !== null && reading.lossPct + eps >= spec.lossPct;
}

function conditionApproaching(
  spec: ConditionSpec,
  reading: RepReading,
  policy: EffortPolicy
): boolean {
  const eps = policy.conditionEpsilon;
  if (spec.reason === 'reps') {
    return (
      spec.repsHigh !== null && reading.repNumber >= spec.repsHigh - policy.approachingRepsBefore
    );
  }
  if (spec.reason === 'effort') {
    const target =
      spec.targetRpe === null ? null : 10 - spec.targetRpe + policy.approachingRirMargin;
    return target !== null && reading.rir !== null && reading.rir <= target + eps;
  }
  const target = spec.lossPct === null ? null : spec.lossPct * policy.approachingLossFraction;
  return target !== null && reading.lossPct !== null && reading.lossPct + eps >= target;
}

// =============================================================================
// The walk over the reps
// =============================================================================

function readRep(
  rep: EffortRepInput,
  context: EffortSetContext,
  basis: EffortBasis,
  bestVelocityMps: number,
  policy: EffortPolicy
): RepReading {
  const blank: RepReading = {
    repNumber: rep.repNumber,
    lossPct: null,
    rir: null,
    rirRange: null,
    rpe: null,
    band: null,
    confidence: null,
  };
  if (!rep.eligible || !Number.isFinite(rep.meanVelocityMps)) return blank;
  const lossPct =
    bestVelocityMps > 0 ? ((bestVelocityMps - rep.meanVelocityMps) / bestVelocityMps) * 100 : null;
  const profile = context.profile;
  if (basis !== 'profile' || profile === null) {
    const band =
      basis === 'velocity_loss_table'
        ? bandForLoss(lossPct, context.bandReferenceLossPct, policy)
        : null;
    return { ...blank, lossPct, band };
  }
  const rir = rirForVelocity(profile, rep.meanVelocityMps);
  const half = policy.rirIntervalZ * profile.rirErrorReps;
  const [fitLow, fitHigh] = profile.rirRange;
  return {
    repNumber: rep.repNumber,
    lossPct,
    rir,
    rirRange: { low: Math.max(0, rir - half), high: rir + half },
    rpe: 10 - rir,
    band: bandForRir(rir, policy),
    confidence: rir >= fitLow && rir <= fitHigh ? 'high' : 'low',
  };
}

interface Walk {
  reps: EffortRep[];
  bestVelocityMps: number | null;
  lastEligible: RepReading | null;
  reason: CueReason | null;
  reachedAtRep: number | null;
  repsPastCue: number;
  alsoTrue: { reason: CueReason; atRep: number }[];
  state: CueState;
}

function stateBeforeLatch(
  goal: ConditionSpec | null,
  guard: ConditionSpec | null,
  reading: RepReading,
  policy: EffortPolicy
): CueState {
  const specs = [goal, guard].filter((spec): spec is ConditionSpec => spec !== null);
  if (specs.some((spec) => conditionApproaching(spec, reading, policy))) return 'approaching';
  const inRange =
    goal?.reason === 'reps' && goal.repsLow !== null && reading.repNumber >= goal.repsLow;
  return inRange ? 'in_range' : 'working';
}

/** Latch the first true condition; a tie goes to the goal, the loser is recorded. */
function latchCue(
  walk: Walk,
  goal: ConditionSpec | null,
  guard: ConditionSpec | null,
  reading: RepReading,
  policy: EffortPolicy
): boolean {
  const goalMet = goal !== null && conditionMet(goal, reading, policy);
  const guardMet = guard !== null && conditionMet(guard, reading, policy);
  if (walk.reason !== null) {
    for (const spec of [goal, guard]) {
      if (spec === null || spec.reason === walk.reason) continue;
      if (!conditionMet(spec, reading, policy)) continue;
      if (walk.alsoTrue.some((entry) => entry.reason === spec.reason)) continue;
      walk.alsoTrue.push({ reason: spec.reason, atRep: reading.repNumber });
    }
    return false;
  }
  const winner = goalMet ? goal : guardMet ? guard : null;
  if (winner === null) return false;
  walk.reason = winner.reason;
  walk.reachedAtRep = reading.repNumber;
  if (guardMet && guard !== null && guard.reason !== winner.reason) {
    walk.alsoTrue.push({ reason: guard.reason, atRep: reading.repNumber });
  }
  return true;
}

function walkSet(
  context: EffortSetContext,
  reps: readonly EffortRepInput[],
  basis: EffortBasis,
  conditions: { goal: ConditionSpec | null; guard: ConditionSpec | null },
  policy: EffortPolicy
): Walk {
  const walk: Walk = {
    reps: [],
    bestVelocityMps: null,
    lastEligible: null,
    reason: null,
    reachedAtRep: null,
    repsPastCue: 0,
    alsoTrue: [],
    state: 'working',
  };
  for (const rep of reps) {
    const latchedAlready = walk.reason !== null;
    if (latchedAlready) walk.repsPastCue += 1;
    if (rep.eligible && Number.isFinite(rep.meanVelocityMps)) {
      walk.bestVelocityMps = Math.max(
        walk.bestVelocityMps ?? rep.meanVelocityMps,
        rep.meanVelocityMps
      );
    }
    const reading = readRep(rep, context, basis, walk.bestVelocityMps ?? 0, policy);
    let firedHere = false;
    if (rep.eligible) {
      firedHere = latchCue(walk, conditions.goal, conditions.guard, reading, policy);
      walk.lastEligible = reading;
      if (walk.reason === null) {
        walk.state = stateBeforeLatch(conditions.goal, conditions.guard, reading, policy);
      }
    }
    if (walk.reason !== null) walk.state = firedHere ? 'reached' : 'past';
    walk.reps.push({
      ...reading,
      velocityMps: rep.meanVelocityMps,
      cueState: walk.state,
      cueFiredHere: firedHere,
    });
  }
  return walk;
}

// =============================================================================
// Markers
// =============================================================================

function markerBand(
  spec: ConditionSpec,
  context: EffortSetContext,
  basis: EffortBasis,
  velocityMps: number | null,
  policy: EffortPolicy
): EffortBand | null {
  if (basis !== 'profile' || context.profile === null) return null;
  if (spec.reason === 'effort' && spec.targetRpe !== null) {
    return bandForRir(10 - spec.targetRpe, policy);
  }
  if (spec.reason === 'velocity_loss' && velocityMps !== null) {
    return bandForRir(rirForVelocity(context.profile, velocityMps), policy);
  }
  return null;
}

function buildMarker(
  role: 'goal' | 'guard',
  spec: ConditionSpec | null,
  context: EffortSetContext,
  basis: EffortBasis,
  walk: Walk,
  policy: EffortPolicy
): EffortMarker | null {
  if (spec === null) return null;
  const profile = context.profile;
  let velocityMps: number | null = null;
  if (
    spec.reason === 'effort' &&
    basis === 'profile' &&
    profile !== null &&
    spec.targetRpe !== null
  ) {
    velocityMps = velocityForRir(profile, 10 - spec.targetRpe);
  } else if (
    spec.reason === 'velocity_loss' &&
    walk.bestVelocityMps !== null &&
    spec.lossPct !== null
  ) {
    velocityMps = walk.bestVelocityMps * (1 - spec.lossPct / 100);
  }
  const fired = walk.reason === spec.reason;
  const alsoTrue = walk.alsoTrue.find((entry) => entry.reason === spec.reason);
  return {
    role,
    condition: spec.reason,
    axis: spec.reason === 'reps' ? 'rep' : 'velocity',
    repsLow: spec.repsLow,
    repsHigh: spec.repsHigh,
    velocityMps,
    lossPct: spec.lossPct,
    targetRpe: spec.targetRpe,
    band: markerBand(spec, context, basis, velocityMps, policy),
    source: spec.source,
    reached: fired || alsoTrue !== undefined,
    reachedAtRep: fired ? walk.reachedAtRep : (alsoTrue?.atRep ?? null),
  };
}

function cueFallback(
  context: EffortSetContext,
  basis: EffortBasis,
  goal: ConditionSpec | null
): 'reps' | 'velocity_loss' | 'none' | null {
  if (context.goal?.kind !== 'target_rpe' || basis === 'profile') return null;
  if (goal === null) return 'none';
  return goal.reason === 'reps' ? 'reps' : 'velocity_loss';
}

// =============================================================================
// Entry point
// =============================================================================

/**
 * Resolve one set's effort: a band and a state per rep, at most one cue, and
 * the goal and guard markers a chart draws.
 *
 * @param context - Pinned at set start by the caller; plain JSON, never revised mid-set.
 * @param reps - The set's finalized reps in order, velocity on MEAN concentric velocity.
 * @param policy - Every threshold, injectable so a newer table needs no release.
 */
export function resolveSetEffort(
  context: EffortSetContext,
  reps: readonly EffortRepInput[],
  policy: EffortPolicy = EFFORT_POLICY
): SetEffort {
  const { basis, degradedReason } = resolveBasis(context, policy);
  const goal = goalCondition(context, basis);
  const guard = guardCondition(context, basis, goal, policy);
  const walk = walkSet(context, reps, basis, { goal, guard }, policy);
  const last = walk.lastEligible;
  return {
    basis,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    bandMeaning:
      basis === 'profile' ? 'effort' : basis === 'velocity_loss_table' ? 'velocity_loss' : null,
    bandEdgesMps: bandEdges(context, basis, walk.bestVelocityMps, policy),
    goal: context.goal,
    reps: walk.reps,
    markers: {
      goal: buildMarker('goal', goal, context, basis, walk, policy),
      guard: buildMarker('guard', guard, context, basis, walk, policy),
    },
    cue: {
      state: walk.state,
      reason: walk.reason,
      reachedAtRep: walk.reachedAtRep,
      repsPastCue: walk.repsPastCue,
      alsoTrue: walk.alsoTrue,
      fallback: cueFallback(context, basis, goal),
    },
    set: { rir: last?.rir ?? null, rpe: last?.rpe ?? null, band: last?.band ?? null },
    confidence: last?.confidence ?? null,
    degradedReason,
  };
}
