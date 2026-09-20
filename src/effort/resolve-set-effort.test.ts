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
  EffortGoal,
  EffortGuardInput,
  EffortProfile,
  EffortRepInput,
  EffortSetContext,
} from '@/effort/types';

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
  }));
}

function context(overrides: Partial<EffortSetContext> = {}): EffortSetContext {
  return {
    exerciseClass: 'upper_compound',
    intent: 'hypertrophy',
    goal: null,
    guard: NO_GUARD,
    bandReferenceLossPct: 30,
    relativeIntensity: 0.75,
    constantLoad: true,
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

  it('a non-constant load leaves no band and no velocity-derived condition', () => {
    const ctx = tierB({ goal: VELOCITY_LOSS, constantLoad: false });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.basis).toBe('none');
    expect(effort.degradedReason).toBe('non_constant_load');
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
    expect(effort.markers.guard?.reached).toBe(true);
    expect(effort.markers.guard?.reachedAtRep).toBe(7);
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
    expect(effort.markers.guard).toBeNull();
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
    expect(effort.markers.guard).toBeNull();
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
    expect(effort.markers.guard?.condition).toBe('effort');
    expect(effort.markers.guard?.targetRpe).toBe(EFFORT_POLICY.defaultEffortCapRpe);
    expect(effort.markers.guard?.source).toBe('policy_default');
    expect(effort.cue.reachedAtRep).toBe(7);
  });

  it('takes an injected cap rather than a literal', () => {
    const ctx = tierB({ goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' } });
    const effort = resolveSetEffort(ctx, ramp(), { ...EFFORT_POLICY, defaultEffortCapRpe: 8 });
    expect(effort.markers.guard?.targetRpe).toBe(8);
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('is an explicitly typed loss percent in tier b, not the effort cap', () => {
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
    expect(effort.markers.guard?.condition).toBe('velocity_loss');
    expect(effort.markers.guard?.source).toBe('explicit');
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
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
    expect(effort.markers.guard?.condition).toBe('effort');
    expect(effort.cue.reason).toBe('effort');
    expect(effort.cue.reachedAtRep).toBe(7);
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
    expect(effort.markers.guard?.condition).toBe('velocity_loss');
    expect(effort.cue.reason).toBe('velocity_loss');
    expect(effort.cue.reachedAtRep).toBe(5);
  });

  it('is absent in tier a when no loss number resolves: the rep count cues alone', () => {
    const ctx = context({ goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' } });
    const effort = resolveSetEffort(ctx, ramp());
    expect(effort.markers.guard).toBeNull();
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
    expect(effort.markers.guard?.band).toBe(0);
    expect(effort.markers.guard?.velocityMps).toBeCloseTo(0.5, 6);
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

  it('survives a JSON round trip of the context unchanged', () => {
    const ctx = tierB({
      goal: { kind: 'rep_range', repsLow: 8, repsHigh: 12, source: 'plan' },
      guard: { effortCapRpe: 8, effortCapSource: 'plan', lossPct: 30, lossSource: 'explicit' },
    });
    const roundTripped: EffortSetContext = JSON.parse(JSON.stringify(ctx));
    expect(roundTripped).toEqual(ctx);
    expect(resolveSetEffort(roundTripped, ramp())).toEqual(resolveSetEffort(ctx, ramp()));
  });
});
