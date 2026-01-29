/**
 * Workout models - hardware-agnostic exercise data structures.
 *
 * Re-exports core models from src/ and adds v0-specific models
 * (session, plan, stats) that handle higher-level workout management.
 */

// Core models from src
export {
  // Types
  MovementPhase,
  PhaseNames,
  // Phase
  type Phase,
  EMPTY_PHASE,
  addSampleToPhase,
  rebuildPhaseFromSamples,
  getPhaseDuration,
  getPhaseHoldDuration,
  getPhaseMovementDuration,
  getPhaseMeanVelocity,
  getPhaseMeanForce,
  getPhaseRangeOfMotion,
  // Rep
  type Rep,
  createRep,
  addSampleToRep,
  isInEccentricPhase,
  getRepDuration,
  getRepTempo,
  getRepMeanVelocity,
  getRepPeakVelocity,
  getRepPeakForce,
  getRepRangeOfMotion,
  getRepSamples,
  // Sample
  type WorkoutSample,
  // Tempo
  formatTempo,
  parseTempo,
} from '@/models';

// Set (v0-specific, has weight/id/etc but uses src Rep)
export type { Set, TempoTarget } from './set';

// Stats (recording session aggregates)
export type { WorkoutStats } from './stats';
export { computeWorkoutStats, createEmptyWorkoutStats } from './stats';

// Plan
export type { PlannedSet, ExercisePlan, PlanSource, TrainingGoal } from './plan';
export {
  createEmptyPlan,
  getCurrentSetIndex,
  getPlannedSet,
  isDiscoveryPlan,
  getPlanVolume,
} from './plan';

// Session
export type { ExerciseSession, SetComparison } from './session';
export {
  createExerciseSession,
  getSessionCurrentSetIndex,
  getCurrentPlannedSet,
  isResting,
  getRemainingRestSeconds,
  isSessionComplete,
  isDiscoverySession,
  getCompletedVolume,
  getTotalReps,
  addCompletedSet,
  startRest,
  clearRest,
  compareSetAtIndex,
  getAllSetComparisons,
} from './session';
