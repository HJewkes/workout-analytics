/**
 * Workout Analytics Library
 *
 * Hardware-agnostic workout analytics for analyzing reps, sets,
 * estimating RPE/RIR, calculating strength (1RM), velocity profiles,
 * and fatigue estimates.
 */

// Models
export {
  // Types
  MovementPhase,
  PhaseNames,
  ActivityState,
  type WorkoutSample,

  // Phase
  type Phase,
  createPhase,
  addSampleToPhase,

  // Rep
  type Rep,
  createRep,
  addSampleToRep,
  forceCompleteRep,

  // Set
  type Set,
  type AddSampleResult,
  createSet,
  addSampleToSet,
  stopSet,
} from './models';
