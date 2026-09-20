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
};
