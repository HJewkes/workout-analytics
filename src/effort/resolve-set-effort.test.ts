/**
 * Effort resolver tests (VW-518).
 *
 * The fixture is one nine-rep ramp shared by every case, so a reader can hold
 * one table in their head. With the test profile (intercept 0.20 m/s, slope
 * 0.10 m/s per RIR) each rep reads a clean half-RIR step, and loss from the
 * best rep is a clean fraction:
 *
 *   rep     1     2     3     4     5     6     7     8     9
 *   m/s   0.60  0.55  0.50  0.45  0.40  0.35  0.30  0.25  0.20
 *   RIR    4.0   3.5   3.0   2.5   2.0   1.5   1.0   0.5   0.0
 *   RPE    6.0   6.5   7.0   7.5   8.0   8.5   9.0   9.5  10.0
 *   loss%  0.0   8.3  16.7  25.0  33.3  41.7  50.0  58.3  66.7
 */
import { describe, it, expect } from 'vitest';
import { resolveSetEffort } from '@/effort/resolve-set-effort';
import { EFFORT_POLICY } from '@/effort/policy';
import type {
  CueReason,
  EffortBasis,
  EffortGoal,
  EffortGuardInput,
  EffortProfile,
  EffortRepInput,
  EffortResistanceFamily,
  EffortSetContext,
} from '@/effort/types';
// Type-only, through the PUBLIC door: typecheck fails if the root barrel drops one.
import type {
  EffortResistance as PublicEffortResistance,
  EffortResistanceFamily as PublicEffortResistanceFamily,
  ResistanceCapability as PublicResistanceCapability,
  SetEffort as PublicSetEffort,
} from '@/index';

// =============================================================================
// Fixture
// =============================================================================

const RAMP = [0.6, 0.55, 0.5, 0.45, 0.4, 0.35, 0.3, 0.25, 0.2];

const PROFILE: EffortProfile = {
  interceptMps: 0.2,
  slopeMpsPerRir: 0.1,
  rirErrorReps: 0.5,
  rirRange: [0, 5],
  intensityRange: [0.6, 0.9],
  resistanceFamily: 'constant',
  modelVersion: 'rir-velocity@1.0.0',
};

const NO_GUARD: EffortGuardInput = {
  effortCapRpe: null,
  effortCapSource: null,
  lossPct: null,
  lossSource: null,
};

function ramp(count = RAMP.length, eligible = true): EffortRepInput[] {
  return RAMP.slice(0, count).map((meanVelocityMps, i) => ({
    repNumber: i + 1,
    meanVelocityMps,
    eligible,
    sameSettingAsSetStart: true,
  }));
}

/** The same ramp with the setting reported changed from `fromRep` on. */
function rampWithSettingChange(fromRep: number): EffortRepInput[] {
  return ramp().map((rep) => ({ ...rep, sameSettingAsSetStart: rep.repNumber < fromRep }));
}

function context(overrides: Partial<EffortSetContext> = {}): EffortSetContext {
  return {
    exerciseClass: 'upper_compound',
    intent: 'hypertrophy',
    goal: null,
    guard: NO_GUARD,
    bandReferenceLossPct: 30,
    relativeIntensity: 0.75,
    resistance: { family: 'constant', signature: 'sig-a' },
    velocitySignalValid: true,
    profile: null,
    ...overrides,
  };
}

/** Tier b: a trusted profile is supplied. */
function tierB(overrides: Partial<EffortSetContext> = {}): EffortSetContext {
  return context({ profile: PROFILE, ...overrides });
}

const REP_RANGE: EffortGoal = { kind: 'rep_range', repsLow: 3, repsHigh: 5, source: 'plan' };
const TARGET_RPE: EffortGoal = {
  kind: 'target_rpe',
  targetRpe: 8,
  repsLow: null,
  repsHigh: null,
  source: 'plan',
};
const VELOCITY_LOSS: EffortGoal = { kind: 'velocity_loss', lossPct: 30, source: 'plan' };

// =============================================================================
// Every goal kind, in both tiers
// =============================================================================

describe('goal kinds cue on the right rep in both tiers', () => {
  const cases: Array<{
    name: string;
    ctx: EffortSetContext;
    reason: CueReason;
    atRep: number;
  }> = [
    {
      name: 'tier a rep_range cues at the top of the range',
      ctx: context({ goal: REP_RANGE }),
      reason: 'reps',
      atRep: 5,
    },
    {
      name: 'tier b rep_range still cues at the top of the range',
      ctx: tierB({ goal: REP_RANGE }),
      reason: 'reps',
      atRep: 5,
    },
    {
      name: 'tier b target_rpe cues when predicted RIR reaches 10 - RPE',
      ctx: tierB({ goal: TARGET_RPE }),
      reason: 'effort',
      atRep: 5,
    },
    {
      name: 'tier a target_rpe falls back to the rep range it states',
      ctx: context({ goal: { ...TARGET_RPE, repsLow: 3, repsHigh: 6 } }),
      reason: 'reps',
      atRep: 6,
    },
    {
      name: 'tier a velocity_loss cues when loss reaches the target',
      ctx: context({ goal: VELOCITY_LOSS }),
      reason: 'velocity_loss',
      atRep: 5,
    },
    {
      name: 'tier b velocity_loss cues on the same loss reading',
      ctx: tierB({ goal: VELOCITY_LOSS }),
      reason: 'velocity_loss',
      atRep: 5,
    },
  ];

  it.each(cases)('$name', ({ ctx, reason, atRep }) => {
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe(reason);
    expect(effort.cue.reachedAtRep).toBe(atRep);
    expect(effort.reps.filter((rep) => rep.cueFiredHere).map((rep) => rep.repNumber)).toEqual([
      atRep,
    ]);
  });
});

describe('the tier decides what a band means and whether RPE is readable', () => {
  it('tier b reads absolute effort and states one RPE', () => {
    const effort = resolveSetEffort(tierB({ goal: REP_RANGE }), ramp(5));
    expect(effort.basis).toBe('profile');
    expect(effort.bandMeaning).toBe('effort');
    expect(effort.degradedReason).toBeNull();
    expect(effort.reps.map((rep) => rep.band)).toEqual([0, 0, 0, 0, 1]);
    expect(effort.set.rpe).toBeCloseTo(8, 6);
    expect(effort.set.rir).toBeCloseTo(2, 6);
    expect(effort.confidence).toBe('high');
  });

  it('tier a withholds RPE entirely and bands by thirds of the reference loss', () => {
    const effort = resolveSetEffort(context({ goal: REP_RANGE }), ramp());
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.bandMeaning).toBe('velocity_loss');
    expect(effort.degradedReason).toBe('no_profile');
    expect(effort.set.rpe).toBeNull();
    expect(effort.set.rir).toBeNull();
    expect(effort.reps.every((rep) => rep.rpe === null && rep.rir === null)).toBe(true);
    // Reference loss 30% cuts at 10 / 20 / 30.
    expect(effort.reps.map((rep) => rep.band)).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 3]);
  });

  it('an unreadable family leaves no band and no velocity-derived condition', () => {
    const ctx = tierB({
      goal: VELOCITY_LOSS,
      resistance: { family: 'isokinetic', signature: 'sig-iso' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.basis).toBe('none');
    expect(effort.degradedReason).toBe('resistance_family_not_readable');
    expect(effort.bandMeaning).toBeNull();
    expect(effort.bandEdgesMps).toEqual([null, null, null]);
    expect(effort.reps.every((rep) => rep.band === null)).toBe(true);
    expect(effort.cue.reason).toBeNull();
    expect(effort.markers.goal).toBeNull();
  });

  it('a rep-count goal still cues when the velocity signal is invalid', () => {
    const effort = resolveSetEffort(
      context({ goal: REP_RANGE, velocitySignalValid: false }),
      ramp()
    );
    expect(effort.basis).toBe('none');
    expect(effort.degradedReason).toBe('velocity_signal_invalid');
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('refuses a profile fitted under a different resistance family', () => {
    const foreign = { ...PROFILE, resistanceFamily: 'chains' as EffortResistanceFamily };
    const effort = resolveSetEffort(context({ goal: REP_RANGE, profile: foreign }), ramp(3));
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.degradedReason).toBe('profile_family_mismatch');
  });

  it('a set outside the profile intensity span drops to tier a', () => {
    const effort = resolveSetEffort(tierB({ goal: REP_RANGE, relativeIntensity: 0.4 }), ramp(3));
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.degradedReason).toBe('intensity_out_of_domain');
  });

  it('a non-positive fitted slope drops to tier a rather than inverting the reading', () => {
    const broken = { ...PROFILE, slopeMpsPerRir: 0 };
    const effort = resolveSetEffort(context({ goal: REP_RANGE, profile: broken }), ramp(3));
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.degradedReason).toBe('profile_slope_not_positive');
  });
});

// =============================================================================
// The resistance family
// =============================================================================

describe('the resistance family decides what velocity can answer', () => {
  const cases: Array<{ family: EffortResistanceFamily; basis: EffortBasis }> = [
    { family: 'constant', basis: 'profile' },
    { family: 'chains', basis: 'velocity_loss_table' },
    { family: 'eccentric_overload', basis: 'velocity_loss_table' },
    { family: 'damper', basis: 'velocity_loss_table' },
    { family: 'isokinetic', basis: 'none' },
  ];

  it.each(cases)(
    '$family resolves basis $basis even with a trusted profile',
    ({ family, basis }) => {
      const ctx = tierB({ goal: REP_RANGE, resistance: { family, signature: `sig-${family}` } });
      expect(resolveSetEffort(ctx, ramp()).basis).toBe(basis);
    }
  );

  it.each(cases)('$family still cues on the rep count', ({ family }) => {
    const ctx = tierB({ goal: REP_RANGE, resistance: { family, signature: `sig-${family}` } });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('reads chains as within-set loss and leaks no RPE, trusted profile or not', () => {
    const ctx = tierB({
      goal: REP_RANGE,
      resistance: { family: 'chains', signature: 'sig-chains' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.degradedReason).toBe('resistance_family_not_profile_capable');
    expect(effort.bandMeaning).toBe('velocity_loss');
    expect(effort.set).toEqual({ rir: null, rpe: null, band: 3 });
    expect(effort.confidence).toBeNull();
    expect(effort.reps.every((rep) => rep.rpe === null && rep.rir === null)).toBe(true);
    expect(effort.reps.every((rep) => rep.rirRange === null)).toBe(true);
    expect(effort.markers.goal?.targetRpe).toBeNull();
    expect(effort.markers.guards.every((marker) => marker.targetRpe === null)).toBe(true);
    // The colours are still real: loss from the set's own fastest rep.
    expect(effort.reps.map((rep) => rep.band)).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 3]);
  });

  it('guards a chains set on a typed percent', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'explicit' };
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
      resistance: { family: 'chains', signature: 'sig-chains' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['velocity_loss']);
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('guards an eccentric-overload set on an intent percent, as tier a does', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'plan_intent' };
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
      resistance: { family: 'eccentric_overload', signature: 'sig-ecc' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['velocity_loss']);
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('colours a damper set by loss and states no RPE', () => {
    const ctx = context({
      goal: REP_RANGE,
      resistance: { family: 'damper', signature: 'sig-damper' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.bandMeaning).toBe('velocity_loss');
    expect(effort.reps.map((rep) => rep.band)).toEqual([0, 0, 1, 2, 3, 3, 3, 3, 3]);
    expect(effort.reps.every((rep) => rep.rpe === null && rep.rir === null)).toBe(true);
    expect(effort.set.rpe).toBeNull();
  });

  it('guards a damper set on a typed percent', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'explicit' };
    const ctx = context({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
      resistance: { family: 'damper', signature: 'sig-damper' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['velocity_loss']);
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('does NOT guard a damper set on an intent percent', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'plan_intent' };
    const ctx = context({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
      resistance: { family: 'damper', signature: 'sig-damper' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards).toEqual([]);
    expect(effort.cue.reason).toBeNull();
    // Still coloured: the loss reading is real, only the borrowed number is not.
    expect(effort.reps.at(-1)?.band).toBe(3);
  });

  it('refuses a damper-family profile rather than reading an effort scale from it', () => {
    const damperProfile = { ...PROFILE, resistanceFamily: 'damper' as EffortResistanceFamily };
    const ctx = context({
      goal: REP_RANGE,
      profile: damperProfile,
      resistance: { family: 'damper', signature: 'sig-damper' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.basis).toBe('velocity_loss_table');
    expect(effort.degradedReason).toBe('profile_family_has_no_effort_scale');
    expect(effort.reps.every((rep) => rep.rpe === null && rep.rir === null)).toBe(true);
    expect(effort.set).toEqual({ rir: null, rpe: null, band: 3 });
    expect(effort.markers.guards.every((marker) => marker.targetRpe === null)).toBe(true);
  });

  it('does not let an intent percent cue a damper target_rpe set either', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'plan_intent' };
    const ctx = context({
      goal: TARGET_RPE,
      guard,
      resistance: { family: 'damper', signature: 'sig-damper' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.fallback).toBe('none');
    expect(effort.cue.reason).toBeNull();
  });

  it('leaves an isokinetic set with no velocity reading at all', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'explicit' };
    const ctx = context({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
      resistance: { family: 'isokinetic', signature: 'sig-iso' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.basis).toBe('none');
    expect(effort.markers.guards).toEqual([]);
    expect(effort.reps.every((rep) => rep.band === null && rep.lossPct === null)).toBe(true);
    expect(effort.cue.reason).toBeNull();
  });
});

describe('a setting changed mid-set suspends the velocity conditions', () => {
  it('suspends them from that rep on and says why', () => {
    const ctx = context({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard: { ...NO_GUARD, lossPct: 30, lossSource: 'explicit' },
    });
    // Loss would otherwise cross 30% on rep 5; the setting changes on rep 4.
    const effort = resolveSetEffort(ctx, rampWithSettingChange(4));
    expect(effort.degradedReason).toBe('setting_changed_mid_set');
    expect(effort.cue.reason).toBeNull();
    expect(effort.reps.slice(0, 3).every((rep) => rep.band !== null)).toBe(true);
    expect(effort.reps.slice(3).every((rep) => rep.band === null && rep.lossPct === null)).toBe(
      true
    );
  });

  it('keeps the rep count cueing across the change', () => {
    const ctx = context({ goal: REP_RANGE });
    const effort = resolveSetEffort(ctx, rampWithSettingChange(2));
    expect(effort.degradedReason).toBe('setting_changed_mid_set');
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('leaves an already latched cue latched', () => {
    const ctx = context({
      goal: { kind: 'rep_range', repsLow: 10, repsHigh: 12, source: 'plan' },
      guard: { ...NO_GUARD, lossPct: 30, lossSource: 'explicit' },
    });
    // The loss guard latches on rep 5; the setting changes on rep 6.
    const effort = resolveSetEffort(ctx, rampWithSettingChange(6));
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.repsPastCue).toBe(4);
    expect(effort.reps.at(-1)?.cueState).toBe('past');
  });

  it('stays suspended even if a later rep reports the setting is back', () => {
    // Only rep 4 is flagged. The set's fastest rep is no longer a fair baseline
    // for what follows, so the suspension is sticky for the rest of the set.
    const reps = ramp().map((rep) => ({
      ...rep,
      sameSettingAsSetStart: rep.repNumber !== 4,
    }));
    const effort = resolveSetEffort(context({ goal: VELOCITY_LOSS }), reps);
    expect(effort.degradedReason).toBe('setting_changed_mid_set');
    expect(effort.cue.reason).toBeNull();
    expect(effort.reps.slice(3).every((rep) => rep.band === null)).toBe(true);
  });

  it('holds the last honest reading rather than blanking the set RPE', () => {
    const effort = resolveSetEffort(tierB({ goal: REP_RANGE }), rampWithSettingChange(4));
    expect(effort.set.rpe).toBeCloseTo(7, 6);
    expect(effort.reps.at(-1)?.rpe).toBeNull();
  });
});

// =============================================================================
// The latch, the tie, alsoTrue and past
// =============================================================================

describe('exactly one ending cue per set', () => {
  it('latches on the first condition and never revises it', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 3, repsHigh: 5, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.reps.filter((rep) => rep.cueFiredHere)).toHaveLength(1);
  });

  it('a tie on one rep goes to the goal, and the guard is recorded silently', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 3, repsHigh: 7, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(7);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'effort', atRep: 7 }]);
    expect(effort.reps.filter((rep) => rep.cueFiredHere)).toHaveLength(1);
  });

  it('a condition that becomes true after the latch lands in alsoTrue once', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 3, repsHigh: 5, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'effort', atRep: 7 }]);
    expect(effort.markers.guards[0]?.reached).toBe(true);
    expect(effort.markers.guards[0]?.reachedAtRep).toBe(7);
  });

  it('reps after the latch are past, and the set counts them', () => {
    const effort = resolveSetEffort(context({ goal: REP_RANGE }), ramp());
    expect(effort.reps.map((rep) => rep.cueState)).toEqual([
      'working',
      'working',
      'in_range',
      'approaching',
      'reached',
      'past',
      'past',
      'past',
      'past',
    ]);
    expect(effort.cue.repsPastCue).toBe(4);
    expect(effort.cue.state).toBe('past');
  });
});

describe('approaching, from each of its three sources', () => {
  it('reaches approaching one rep before the top of the rep range', () => {
    const effort = resolveSetEffort(context({ goal: REP_RANGE }), ramp(4));
    expect(effort.reps.at(-1)?.cueState).toBe('approaching');
    expect(effort.cue.reason).toBeNull();
  });

  it('reaches approaching within one RIR of the effort condition', () => {
    const effort = resolveSetEffort(tierB({ goal: TARGET_RPE }), ramp(4));
    expect(effort.reps.map((rep) => rep.cueState)).toEqual([
      'working',
      'working',
      'approaching',
      'approaching',
    ]);
  });

  it('reaches approaching past two thirds of the loss target', () => {
    const effort = resolveSetEffort(context({ goal: VELOCITY_LOSS }), ramp(4));
    // Loss reaches 20% (two thirds of 30) on rep 4.
    expect(effort.reps.map((rep) => rep.cueState)).toEqual([
      'working',
      'working',
      'working',
      'approaching',
    ]);
  });
});

// =============================================================================
// The three target_rpe fallbacks
// =============================================================================

describe('a target_rpe goal before a trusted profile', () => {
  it('falls back to the top of the rep range first', () => {
    const goal: EffortGoal = { ...TARGET_RPE, repsLow: 3, repsHigh: 6 };
    const effort = resolveSetEffort(
      context({ goal, guard: { ...NO_GUARD, lossPct: 30, lossSource: 'plan_intent' } }),
      ramp()
    );
    expect(effort.cue.fallback).toBe('reps');
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(6);
    expect(effort.markers.goal?.axis).toBe('rep');
    expect(effort.markers.goal?.targetRpe).toBe(8);
    expect(effort.markers.guards).toEqual([]);
  });

  it('falls back to a resolved loss number when the row states no range', () => {
    const guard: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'plan_intent' };
    const effort = resolveSetEffort(context({ goal: TARGET_RPE, guard }), ramp());
    expect(effort.cue.fallback).toBe('velocity_loss');
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.markers.goal?.axis).toBe('velocity');
    expect(effort.markers.goal?.targetRpe).toBe(8);
    expect(effort.markers.goal?.source).toBe('plan_intent');
  });

  it('falls back to no cue when neither a range nor a loss number exists', () => {
    const effort = resolveSetEffort(context({ goal: TARGET_RPE }), ramp());
    expect(effort.cue.fallback).toBe('none');
    expect(effort.cue.reason).toBeNull();
    expect(effort.markers.goal).toBeNull();
    expect(effort.markers.guards).toEqual([]);
  });

  it('reads no fallback once a profile is trusted', () => {
    expect(resolveSetEffort(tierB({ goal: TARGET_RPE }), ramp()).cue.fallback).toBeNull();
  });
});

// =============================================================================
// Guards
// =============================================================================

describe('the guard', () => {
  it('may fire before the bottom of the rep range', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(7);
    expect(effort.cue.reachedAtRep).toBeLessThan(8);
  });

  it('caps at the policy default when the row states no RPE', () => {
    const ctx = tierB({ goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' } });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards[0]?.condition).toBe('effort');
    expect(effort.markers.guards[0]?.targetRpe).toBe(EFFORT_POLICY.defaultEffortCapRpe);
    expect(effort.markers.guards[0]?.source).toBe('policy_default');
    expect(effort.cue.reachedAtRep).toBe(7);
  });

  it('takes an injected cap rather than a literal', () => {
    const ctx = tierB({ goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' } });
    const effort = resolveSetEffort(ctx, ramp(), { ...EFFORT_POLICY, defaultEffortCapRpe: 8 });
    expect(effort.markers.guards[0]?.targetRpe).toBe(8);
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('keeps an explicitly typed loss percent AND the effort cap live in tier b', () => {
    const guard: EffortGuardInput = {
      effortCapRpe: null,
      effortCapSource: null,
      lossPct: 30,
      lossSource: 'explicit',
    };
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
    });
    const effort = resolveSetEffort(ctx, ramp());
    // Stable tie-break order: effort first, then loss.
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual([
      'effort',
      'velocity_loss',
    ]);
    expect(effort.markers.guards[1]?.source).toBe('explicit');
    // Loss reaches 30% on rep 5; the effort cap of RPE 9 is not reached until rep 7.
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'effort', atRep: 7 }]);
  });

  it('fires the effort cap first when it comes before the typed percent', () => {
    const guard: EffortGuardInput = {
      effortCapRpe: 8,
      effortCapSource: 'plan',
      lossPct: 50,
      lossSource: 'explicit',
    };
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'velocity_loss', atRep: 7 }]);
    expect(effort.reps.filter((rep) => rep.cueFiredHere)).toHaveLength(1);
  });

  it('breaks a tie between the two guards in favour of effort', () => {
    const guard: EffortGuardInput = {
      effortCapRpe: 9,
      effortCapSource: 'plan',
      lossPct: 50,
      lossSource: 'explicit',
    };
    // Rep 7 reads RIR 1 (RPE 9) and 50% loss at once; the rep range is never reached.
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 10, repsHigh: 12, source: 'plan' },
      guard,
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(7);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'velocity_loss', atRep: 7 }]);
  });

  it('gives the goal the cue when it and both guards come true on one rep', () => {
    const guard: EffortGuardInput = {
      effortCapRpe: 9,
      effortCapSource: 'plan',
      lossPct: 50,
      lossSource: 'explicit',
    };
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 3, repsHigh: 7, source: 'plan' },
      guard,
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBe('reps');
    expect(effort.cue.reachedAtRep).toBe(7);
    expect(effort.cue.alsoTrue).toEqual([
      { reason: 'effort', atRep: 7 },
      { reason: 'velocity_loss', atRep: 7 },
    ]);
    expect(effort.reps.filter((rep) => rep.cueFiredHere)).toHaveLength(1);
  });

  it('is NOT an intent-derived loss percent in tier b: effort replaces it', () => {
    const guard: EffortGuardInput = {
      effortCapRpe: null,
      effortCapSource: null,
      lossPct: 30,
      lossSource: 'plan_intent',
    };
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['effort']);
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(7);
  });

  it('caps a tier b velocity_loss goal with the effort guard, which can fire first', () => {
    const ctx = tierB({
      goal: { kind: 'velocity_loss', lossPct: 60, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['effort']);
    // RPE 9 is RIR 1: the guard line sits at 0.30 m/s and draws band 2.
    expect(effort.markers.guards[0]?.targetRpe).toBe(9);
    expect(effort.markers.guards[0]?.velocityMps).toBeCloseTo(0.3, 6);
    expect(effort.markers.guards[0]?.band).toBe(2);
    // Loss does not reach 60% until rep 9, so the cap cues on rep 7.
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(7);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'velocity_loss', atRep: 9 }]);
    expect(effort.markers.guards[0]?.reached).toBe(true);
  });

  it('keeps the effort guard on a tier b velocity_loss goal the loss target wins', () => {
    const ctx = tierB({
      goal: VELOCITY_LOSS,
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['effort']);
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'effort', atRep: 7 }]);
  });

  it('guards a tier b target_rpe goal with a typed percent, which can fire first', () => {
    const ctx = tierB({
      goal: TARGET_RPE,
      guard: { ...NO_GUARD, lossPct: 20, lossSource: 'explicit' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['velocity_loss']);
    expect(effort.markers.guards[0]?.lossPct).toBe(20);
    // A typed loss cap targets no effort, so the guard line stays neutral ink.
    expect(effort.markers.guards[0]?.band).toBeNull();
    // Loss reaches 20% on rep 4; the RPE 8 goal is not reached until rep 5.
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(4);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'effort', atRep: 5 }]);
  });

  it('does NOT guard a tier b target_rpe goal on an intent percent', () => {
    const ctx = tierB({
      goal: TARGET_RPE,
      guard: { ...NO_GUARD, lossPct: 20, lossSource: 'plan_intent' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards).toEqual([]);
    // Loss passes 20% on rep 4 and must not cue; the RPE 8 goal does, on rep 5.
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.alsoTrue).toEqual([]);
  });

  it('keeps the typed guard on a tier b target_rpe goal the RPE target wins', () => {
    const ctx = tierB({
      goal: TARGET_RPE,
      guard: { ...NO_GUARD, lossPct: 50, lossSource: 'explicit' },
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards.map((marker) => marker.condition)).toEqual(['velocity_loss']);
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.alsoTrue).toEqual([{ reason: 'velocity_loss', atRep: 7 }]);
  });

  it('is an intent-derived loss percent in tier a, where effort cannot be read', () => {
    const guard: EffortGuardInput = {
      effortCapRpe: null,
      effortCapSource: null,
      lossPct: 30,
      lossSource: 'plan_intent',
    };
    const ctx = context({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard,
    });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards[0]?.condition).toBe('velocity_loss');
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('is absent in tier a when no loss number resolves: the rep count cues alone', () => {
    const ctx = context({ goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' } });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guards).toEqual([]);
    expect(effort.cue.reason).toBeNull();
    // Nine reps of an 8-to-12 set: inside the zone, nothing spoken.
    expect(effort.cue.state).toBe('in_range');
  });
});

// =============================================================================
// Markers
// =============================================================================

describe('markers carry the numbers a label is built from, never the words', () => {
  it('colours a rep-range marker neutral and its effort guard by the cap it targets', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 7, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp(2));
    expect(effort.markers.goal).toMatchObject({
      role: 'goal',
      condition: 'reps',
      axis: 'rep',
      repsLow: 8,
      repsHigh: 12,
      band: null,
      velocityMps: null,
      reached: false,
    });
    // RPE 7 is RIR 3, which is band 0: the guard line draws green.
    expect(effort.markers.guards[0]?.band).toBe(0);
    expect(effort.markers.guards[0]?.velocityMps).toBeCloseTo(0.5, 6);
  });

  it('puts a tier b target_rpe marker on the velocity axis at its own colour', () => {
    const effort = resolveSetEffort(tierB({ goal: TARGET_RPE }), ramp(2));
    expect(effort.markers.goal).toMatchObject({ condition: 'effort', axis: 'velocity', band: 1 });
    expect(effort.markers.goal?.velocityMps).toBeCloseTo(0.4, 6);
  });

  it('moves a loss marker with the best rep and leaves tier a neutral', () => {
    const effort = resolveSetEffort(context({ goal: VELOCITY_LOSS }), ramp(2));
    expect(effort.markers.goal?.velocityMps).toBeCloseTo(0.42, 6);
    expect(effort.markers.goal?.band).toBeNull();
  });

  it('colours a tier b loss GOAL by the effort its line predicts, guards stay neutral', () => {
    const ctx = tierB({
      goal: VELOCITY_LOSS,
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const effort = resolveSetEffort(ctx, ramp(2));
    // 30% below the best rep is 0.42 m/s, which the line reads as RIR 2.2: band 1.
    expect(effort.markers.goal?.velocityMps).toBeCloseTo(0.42, 6);
    expect(effort.markers.goal?.band).toBe(1);
    const typed: EffortGuardInput = { ...NO_GUARD, lossPct: 30, lossSource: 'explicit' };
    const guarded = resolveSetEffort(tierB({ goal: TARGET_RPE, guard: typed }), ramp(2));
    expect(guarded.markers.guards[0]?.velocityMps).toBeCloseTo(0.42, 6);
    expect(guarded.markers.guards[0]?.band).toBeNull();
  });

  it('reports band edges as fixed velocities in tier b', () => {
    const effort = resolveSetEffort(tierB({ goal: TARGET_RPE }), ramp(2));
    const edges = effort.bandEdgesMps.map((edge) =>
      edge === null ? null : Number(edge.toFixed(3))
    );
    expect(edges).toEqual([0.45, 0.35, 0.25]);
  });
});

// =============================================================================
// Degenerate sets
// =============================================================================

describe('sets with nothing to read', () => {
  it('resolves an empty set without a cue', () => {
    const effort = resolveSetEffort(context({ goal: REP_RANGE }), []);
    expect(effort.reps).toEqual([]);
    expect(effort.cue).toMatchObject({ state: 'working', reason: null, reachedAtRep: null });
    expect(effort.set).toEqual({ rir: null, rpe: null, band: null });
    expect(effort.bandEdgesMps).toEqual([null, null, null]);
  });

  it('resolves a set whose every rep is ineligible without a cue', () => {
    const effort = resolveSetEffort(tierB({ goal: REP_RANGE }), ramp(9, false));
    expect(effort.cue.reason).toBeNull();
    expect(effort.reps.every((rep) => rep.band === null && rep.lossPct === null)).toBe(true);
    expect(effort.reps.map((rep) => rep.velocityMps)).toEqual(RAMP);
    expect(effort.set).toEqual({ rir: null, rpe: null, band: null });
  });

  it('never reaches a condition the set does not get near', () => {
    const ctx = context({ goal: { kind: 'rep_range', repsLow: 15, repsHigh: 20, source: 'plan' } });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.cue.reason).toBeNull();
    expect(effort.cue.repsPastCue).toBe(0);
    expect(effort.cue.alsoTrue).toEqual([]);
    expect(effort.reps.every((rep) => rep.cueState === 'working')).toBe(true);
  });

  it('ignores an ineligible rep when judging a condition', () => {
    const reps = ramp();
    reps[4] = { ...reps[4], eligible: false };
    const effort = resolveSetEffort(context({ goal: VELOCITY_LOSS }), reps);
    expect(effort.cue.reachedAtRep).toBe(6);
    expect(effort.reps[4].lossPct).toBeNull();
  });
});

// =============================================================================
// Purity
// =============================================================================

describe('the resolver is pure over its pinned context', () => {
  it('latches on the same rep for a prefix as for the whole set', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard: { ...NO_GUARD, effortCapRpe: 9, effortCapSource: 'plan' },
    });
    const whole = resolveSetEffort(ctx, ramp());
    for (let count = 1; count <= RAMP.length; count++) {
      const prefix = resolveSetEffort(ctx, ramp(count));
      if (prefix.cue.reason === null) continue;
      expect(prefix.cue.reason).toBe(whole.cue.reason);
      expect(prefix.cue.reachedAtRep).toBe(whole.cue.reachedAtRep);
    }
    expect(whole.cue.reachedAtRep).toBe(7);
  });

  it('gives an identical answer twice and leaves its inputs untouched', () => {
    const ctx = tierB({ goal: TARGET_RPE });
    const reps = ramp();
    const snapshot = structuredClone({ ctx, reps });
    expect(resolveSetEffort(ctx, reps)).toEqual(resolveSetEffort(ctx, reps));
    expect({ ctx, reps }).toEqual(snapshot);
  });

  it('folds in array order: an out-of-order repNumber moves the latch', () => {
    // PRECONDITION is ascending unique repNumber. This pins what a caller that
    // breaks it gets, rather than silently sorting behind their back.
    const reps: EffortRepInput[] = [1, 2, 3, 5, 4].map((repNumber, i) => ({
      repNumber,
      meanVelocityMps: RAMP[i],
      eligible: true,
      sameSettingAsSetStart: true,
    }));
    const ctx = context({ goal: { kind: 'rep_range', repsLow: 1, repsHigh: 4, source: 'plan' } });
    const effort = resolveSetEffort(ctx, reps);
    expect(effort.cue.reachedAtRep).toBe(5);
    expect(effort.cue.repsPastCue).toBe(1);
  });

  it('folds in array order: a duplicate repNumber latches on its first copy', () => {
    const reps: EffortRepInput[] = [1, 2, 3, 3, 4].map((repNumber, i) => ({
      repNumber,
      meanVelocityMps: RAMP[i],
      eligible: true,
      sameSettingAsSetStart: true,
    }));
    const ctx = context({ goal: { kind: 'rep_range', repsLow: 1, repsHigh: 3, source: 'plan' } });
    const effort = resolveSetEffort(ctx, reps);
    expect(effort.cue.reachedAtRep).toBe(3);
    expect(effort.reps.filter((rep) => rep.cueFiredHere)).toHaveLength(1);
    expect(effort.cue.repsPastCue).toBe(2);
  });

  it('exposes the resistance contract through the root barrel', () => {
    const family: PublicEffortResistanceFamily = 'damper';
    const resistance: PublicEffortResistance = { family, signature: 'sig-public' };
    const capability: PublicResistanceCapability = EFFORT_POLICY.resistanceCapability[family];
    const effort: PublicSetEffort = resolveSetEffort(context({ resistance }), ramp(1));
    expect(capability).toBe('velocity_loss_typed_guard_only');
    expect(effort.basis).toBe('velocity_loss_table');
  });

  it('survives a JSON round trip of the context unchanged', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard: { effortCapRpe: 8, effortCapSource: 'plan', lossPct: 30, lossSource: 'explicit' },
      resistance: { family: 'constant', signature: 'sig-json' },
    });
    expect(ctx.profile?.resistanceFamily).toBe('constant');
    expect(resolveSetEffort(ctx, ramp()).markers.guards).toHaveLength(2);
    const roundTripped: EffortSetContext = JSON.parse(JSON.stringify(ctx));
    expect(roundTripped).toEqual(ctx);
    expect(resolveSetEffort(roundTripped, ramp())).toEqual(resolveSetEffort(ctx, ramp()));
  });
});
