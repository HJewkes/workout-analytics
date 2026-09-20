/**
 * Effort module — the pure set-effort resolver and its policy (VW-518).
 */

export { EFFORT_POLICY, type EffortPolicy } from './policy.js';
export { resolveSetEffort } from './resolve-set-effort.js';
export type {
  CueReason,
  CueState,
  EffortBand,
  EffortBasis,
  EffortConfidence,
  EffortCue,
  EffortDegradedReason,
  EffortExerciseClass,
  EffortGoal,
  EffortGoalSource,
  EffortGuardInput,
  EffortIntent,
  EffortLossSource,
  EffortMarker,
  EffortMarkerSource,
  EffortProfile,
  EffortRep,
  EffortRepInput,
  EffortSetContext,
  SetEffort,
} from './types.js';
