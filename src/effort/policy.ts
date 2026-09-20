/**
 * Every number the effort resolver uses, in one injectable object (VW-518).
 *
 * Each entry is marked OWNER (a ruling the product owner made; changing it
 * changes dose or what the lifter hears) or ENGINEERING DEFAULT (a threshold
 * with no paper or corpus id behind it, safe to tune on evidence). Nothing in
 * the resolver compares against a literal, so a caller can pass a newer table
 * without a release of this package.
 *
 * The tier a intent-to-loss-percent table is deliberately NOT here. Loss
 * numbers reach the resolver already resolved, on the context's `goal`,
 * `guard.lossPct` and `bandReferenceLossPct`, because their precedence rule
 * (explicit, then set intent, then plan intent) reads stored plan rows the
 * resolver never sees.
 */

import type { EffortResistanceFamily } from '@/effort/types';

/**
 * What velocity can answer under one resistance family.
 *
 * - `profile_capable`: a trusted profile fitted in this family reads absolute
 *   effort, so a set can reach tier b.
 * - `velocity_loss_only`: velocity falls with fatigue inside the set, so loss
 *   colours and a loss guard hold, but no number calibrated elsewhere applies.
 *   RPE stays withheld until a profile fitted in this family exists.
 * - `none`: velocity answers nothing. No band and no velocity condition. The
 *   rep count still cues, because it reads no velocity.
 */
export type ResistanceCapability = 'profile_capable' | 'velocity_loss_only' | 'none';

export interface EffortPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
  /** OWNER. The effort cap a trusted set guards at when the row states no RPE. */
  readonly defaultEffortCapRpe: number;
  /** ENGINEERING DEFAULT. RIR at which bands 1, 2 and 3 start, on a sourced RPE scale. */
  readonly rirCuts: readonly [number, number, number];
  /** ENGINEERING DEFAULT. Fractions of the reference loss where tier a bands 1, 2, 3 start. */
  readonly lossBandFractions: readonly [number, number, number];
  /** ENGINEERING DEFAULT. Half-width multiplier for the 95% RIR interval. */
  readonly rirIntervalZ: number;
  /** ENGINEERING DEFAULT. Reps before `repsHigh` at which the rep condition is approaching. */
  readonly approachingRepsBefore: number;
  /** ENGINEERING DEFAULT. RIR margin at which the effort condition is approaching. */
  readonly approachingRirMargin: number;
  /** ENGINEERING DEFAULT. Fraction of the loss target at which it is approaching. */
  readonly approachingLossFraction: number;
  /** ENGINEERING DEFAULT. Slack on the fitted intensity span before a profile is dropped. */
  readonly intensityDomainTolerance: number;
  /** ENGINEERING DEFAULT. Float slack so an exactly-on-target reading counts as reached. */
  readonly conditionEpsilon: number;
  /** What velocity can answer per resistance family. See each row for its standing. */
  readonly resistanceCapability: Readonly<Record<EffortResistanceFamily, ResistanceCapability>>;
}

export const EFFORT_POLICY: EffortPolicy = {
  policyId: 'effort/v1',
  policyVersion: 'effort-policy@1.0.0',
  defaultEffortCapRpe: 9,
  rirCuts: [2.5, 1.5, 0.5],
  lossBandFractions: [1 / 3, 2 / 3, 1],
  rirIntervalZ: 1.96,
  approachingRepsBefore: 1,
  approachingRirMargin: 1,
  approachingLossFraction: 2 / 3,
  intensityDomainTolerance: 0.05,
  conditionEpsilon: 1e-9,
  resistanceCapability: {
    /** OWNER. The calibrated case: a trusted profile reads absolute effort. */
    constant: 'profile_capable',
    /**
     * OWNER, "Readable within the set (Recommended)". The load curve repeats on
     * every rep, so loss from the set's fastest rep tracks fatigue; a threshold
     * or a line calibrated at constant load does not transfer, so no predicted
     * RPE until a profile fitted in this family exists.
     */
    chains: 'velocity_loss_only',
    /** OWNER, the same ruling as chains: the concentric load is constant. */
    eccentric_overload: 'velocity_loss_only',
    /**
     * PENDING OWNER. Designer recommends `velocity_loss_only` with a guard only
     * for an explicitly typed percent, and never RPE or a profile: resistance
     * follows speed, so there is no rep the lifter cannot finish and reps in
     * reserve has no meaning. Held at `none` until that is ruled.
     */
    damper: 'none',
    /**
     * PENDING OWNER. Designer recommends `none`: the device holds the speed, so
     * fatigue shows in force, not velocity. A force-loss basis is its own task.
     */
    isokinetic: 'none',
  },
};
