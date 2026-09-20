/**
 * `resolveSetEffort` — one answer for the hero chart, the rep strip, the RPE
 * readout and the ending cue (VW-518, VW-448 amendment s.4-s.5).
 *
 * The rule. A set is judged against a GOAL (a rep range, a target RPE, or a
 * velocity-loss percent) and its GUARDS, after every finalized eligible rep.
 * The FIRST condition to become true fires the cue and LATCHES; a tie between
 * the goal and a guard goes to the goal, and a condition that becomes true
 * later is recorded in `cue.alsoTrue` and stays silent.
 *
 * What velocity can answer at all depends on the RESISTANCE FAMILY, as policy
 * data: constant load can reach absolute effort, chains and eccentric overload
 * read within-set loss only, and a family velocity cannot speak for gets no
 * band and no velocity condition while its rep count still cues. A mid-set
 * setting change suspends the velocity conditions from that rep on; an already
 * latched cue stays latched.
 *
 * Bar height is the measured mean velocity, passed through untouched; bar
 * COLOUR is absolute effort, which only a trusted profile fitted in the same
 * family can read, so RPE is withheld entirely until one exists. Nothing here
 * ends a set: the cue is advice, and reps after the latch are reported `past`.
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
 * Which rule answers this set. The resistance family decides what velocity can
 * answer at all, through the policy table; an invalid velocity signal closes it
 * off entirely; and a missing, foreign, broken or out-of-domain profile drops
 * the set to the velocity-loss tier.
 */
function resolveBasis(
  context: EffortSetContext,
  policy: EffortPolicy
): { basis: EffortBasis; degradedReason: EffortDegradedReason | null } {
  const capability = policy.resistanceCapability[context.resistance.family];
  if (capability === 'none') {
    return { basis: 'none', degradedReason: 'resistance_family_not_readable' };
  }
  if (!context.velocitySignalValid) {
    return { basis: 'none', degradedReason: 'velocity_signal_invalid' };
  }
  if (capability !== 'profile_capable') {
    // A profile offered for a family with no effort scale is refused, not used.
    const refused =
      capability === 'velocity_loss_typed_guard_only' &&
      context.profile?.resistanceFamily === context.resistance.family;
    return {
      basis: 'velocity_loss_table',
      degradedReason: refused
        ? 'profile_family_has_no_effort_scale'
        : 'resistance_family_not_profile_capable',
    };
  }
  return profileBasis(context, policy);
}

function profileBasis(
  context: EffortSetContext,
  policy: EffortPolicy
): { basis: EffortBasis; degradedReason: EffortDegradedReason | null } {
  const profile = context.profile;
  if (profile === null) return { basis: 'velocity_loss_table', degradedReason: 'no_profile' };
  if (profile.resistanceFamily !== context.resistance.family) {
    return { basis: 'velocity_loss_table', degradedReason: 'profile_family_mismatch' };
  }
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
function goalCondition(
  context: EffortSetContext,
  basis: EffortBasis,
  policy: EffortPolicy
): ConditionSpec | null {
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
  return targetRpeFallback(context, basis, policy);
}

function targetRpeFallback(
  context: EffortSetContext,
  basis: EffortBasis,
  policy: EffortPolicy
): ConditionSpec | null {
  const goal = context.goal;
  if (goal?.kind !== 'target_rpe') return null;
  const repsHigh = goal.repsHigh ?? goal.repsLow;
  if (repsHigh !== null) {
    return repsSpec(goal.repsLow ?? repsHigh, repsHigh, goal.targetRpe, goal.source);
  }
  const { lossPct, lossSource } = context.guard;
  // The damper rule is about the number, not its role: an intent-derived
  // percent cannot cue there as a fallback goal either.
  const usable = lossSource === 'explicit' || !typedLossOnly(context, policy);
  if (basis !== 'none' && lossPct !== null && lossSource !== null && usable) {
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

/**
 * True for a family where an intent-derived loss number has no analogue, so
 * only a typed percent may cue (OWNER, the damper ruling).
 */
function typedLossOnly(context: EffortSetContext, policy: EffortPolicy): boolean {
  return (
    policy.resistanceCapability[context.resistance.family] === 'velocity_loss_typed_guard_only'
  );
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

function compact(specs: ReadonlyArray<ConditionSpec | null>): ConditionSpec[] {
  return specs.filter((spec): spec is ConditionSpec => spec !== null);
}

/**
 * The conditions that may cue BEFORE the goal, returned in tie-break order:
 * effort first, then velocity loss, because RPE always takes part (OWNER).
 *
 * With a trusted profile a rep-range set carries BOTH the effort cap and an
 * EXPLICITLY typed loss percent as live guards (OWNER: "Both it and the effort
 * cap stay live"); an intent-derived loss number still does not guard there.
 * Every other case carries at most one guard. Without a profile only a resolved
 * loss number can guard, because RPE is withheld.
 */
function guardConditions(
  context: EffortSetContext,
  basis: EffortBasis,
  goal: ConditionSpec | null,
  policy: EffortPolicy
): ConditionSpec[] {
  if (goal === null || basis === 'none') return [];
  if (basis !== 'profile') {
    // A tier a `target_rpe` goal reaches a loss number as its own fallback, not as a guard.
    const typedOnly = typedLossOnly(context, policy);
    return compact([context.goal?.kind === 'rep_range' ? lossGuard(context, typedOnly) : null]);
  }
  if (goal.reason === 'effort') return compact([lossGuard(context, true)]);
  if (goal.reason === 'velocity_loss') return [effortGuard(context, policy)];
  return compact([effortGuard(context, policy), lossGuard(context, true)]);
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

/** The reps condition is the only one that reads no velocity. */
function readsNoVelocity(spec: ConditionSpec): boolean {
  return spec.reason === 'reps';
}

function blankReading(repNumber: number): RepReading {
  return {
    repNumber,
    lossPct: null,
    rir: null,
    rirRange: null,
    rpe: null,
    band: null,
    confidence: null,
  };
}

function readRep(
  rep: EffortRepInput,
  context: EffortSetContext,
  basis: EffortBasis,
  bestVelocityMps: number,
  policy: EffortPolicy
): RepReading {
  const blank = blankReading(rep.repNumber);
  // Basis `none` means velocity answers nothing here — not even a loss percent.
  if (basis === 'none' || !Number.isFinite(rep.meanVelocityMps)) return blank;
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
  /** True once a rep reported the setting had changed. Sticky for the rest of the set. */
  settingChanged: boolean;
  lastEligible: RepReading | null;
  reason: CueReason | null;
  reachedAtRep: number | null;
  repsPastCue: number;
  alsoTrue: { reason: CueReason; atRep: number }[];
  state: CueState;
}

function stateBeforeLatch(
  specs: readonly ConditionSpec[],
  goal: ConditionSpec | null,
  reading: RepReading,
  policy: EffortPolicy
): CueState {
  if (specs.some((spec) => conditionApproaching(spec, reading, policy))) return 'approaching';
  const inRange =
    goal?.reason === 'reps' && goal.repsLow !== null && reading.repNumber >= goal.repsLow;
  return inRange ? 'in_range' : 'working';
}

/**
 * Latch the first true condition. `specs` is in priority order — the goal, then
 * the guards — so a tie between the goal and a guard goes to the goal, and a tie
 * between the two guards goes to effort. Every other condition true on that rep
 * or a later one is recorded once, silently.
 */
function latchCue(
  walk: Walk,
  specs: readonly ConditionSpec[],
  reading: RepReading,
  policy: EffortPolicy
): boolean {
  const met = specs.filter((spec) => conditionMet(spec, reading, policy));
  if (met.length === 0) return false;
  const firedHere = walk.reason === null;
  if (firedHere) {
    walk.reason = met[0].reason;
    walk.reachedAtRep = reading.repNumber;
  }
  for (const spec of met) {
    if (spec.reason === walk.reason) continue;
    if (walk.alsoTrue.some((entry) => entry.reason === spec.reason)) continue;
    walk.alsoTrue.push({ reason: spec.reason, atRep: reading.repNumber });
  }
  return firedHere;
}

function walkSet(
  context: EffortSetContext,
  reps: readonly EffortRepInput[],
  basis: EffortBasis,
  conditions: { goal: ConditionSpec | null; specs: readonly ConditionSpec[] },
  policy: EffortPolicy
): Walk {
  const walk: Walk = {
    reps: [],
    bestVelocityMps: null,
    settingChanged: false,
    lastEligible: null,
    reason: null,
    reachedAtRep: null,
    repsPastCue: 0,
    alsoTrue: [],
    state: 'working',
  };
  for (const rep of reps) {
    if (!rep.sameSettingAsSetStart) walk.settingChanged = true;
    const readsVelocity = rep.eligible && !walk.settingChanged;
    if (walk.reason !== null) walk.repsPastCue += 1;
    if (readsVelocity && Number.isFinite(rep.meanVelocityMps)) {
      walk.bestVelocityMps = Math.max(
        walk.bestVelocityMps ?? rep.meanVelocityMps,
        rep.meanVelocityMps
      );
    }
    const reading = readsVelocity
      ? readRep(rep, context, basis, walk.bestVelocityMps ?? 0, policy)
      : blankReading(rep.repNumber);
    // A suspended rep still counts: only the velocity conditions stop.
    const specs = readsVelocity ? conditions.specs : conditions.specs.filter(readsNoVelocity);
    let firedHere = false;
    if (rep.eligible) {
      firedHere = latchCue(walk, specs, reading, policy);
      if (readsVelocity) walk.lastEligible = reading;
      if (walk.reason === null) {
        walk.state = stateBeforeLatch(specs, conditions.goal, reading, policy);
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

/**
 * A marker's own colour: the effort it targets, or null for neutral ink. An
 * effort line always names one. A loss line names one only as a GOAL, where the
 * set is aiming at that velocity and a trusted profile can say what effort it
 * predicts; the same line drawn as a guard is a cap someone typed and stays
 * neutral. A rep count targets no effort at all.
 */
function markerBand(
  role: 'goal' | 'guard',
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
  if (spec.reason === 'velocity_loss' && role === 'goal' && velocityMps !== null) {
    return bandForRir(rirForVelocity(context.profile, velocityMps), policy);
  }
  return null;
}

function buildMarker(
  role: 'goal' | 'guard',
  spec: ConditionSpec,
  context: EffortSetContext,
  basis: EffortBasis,
  walk: Walk,
  policy: EffortPolicy
): EffortMarker {
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
    band: markerBand(role, spec, context, basis, velocityMps, policy),
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
 * @param context - Pinned at set start by the caller; plain JSON, never revised
 *   mid-set. `resistance.family` decides what velocity can answer at all,
 *   through `policy.resistanceCapability`.
 * @param reps - The set's finalized reps, velocity on MEAN concentric velocity.
 *   PRECONDITION: ascending, unique `repNumber`. The walk is a left fold in
 *   array order and does not sort or de-duplicate, so a caller that reorders
 *   reps moves the latch.
 * @param policy - Every threshold, injectable so a newer table needs no release.
 */
export function resolveSetEffort(
  context: EffortSetContext,
  reps: readonly EffortRepInput[],
  policy: EffortPolicy = EFFORT_POLICY
): SetEffort {
  const { basis, degradedReason } = resolveBasis(context, policy);
  const goal = goalCondition(context, basis, policy);
  const guards = guardConditions(context, basis, goal, policy);
  const specs = goal === null ? guards : [goal, ...guards];
  const walk = walkSet(context, reps, basis, { goal, specs }, policy);
  const last = walk.lastEligible;
  // A mid-set setting change outranks the tier reason: it is why nothing newer reads.
  const reason = walk.settingChanged ? 'setting_changed_mid_set' : degradedReason;
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
      goal: goal === null ? null : buildMarker('goal', goal, context, basis, walk, policy),
      guards: guards.map((spec) => buildMarker('guard', spec, context, basis, walk, policy)),
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
    degradedReason: reason,
  };
}
