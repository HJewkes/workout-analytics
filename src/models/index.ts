/**
 * Workout models - hardware-agnostic exercise data structures.
 */

// Enums and constants
export { MovementPhase, PhaseNames } from './types';

// Types
export type { WorkoutSample } from './sample';
export type { Phase } from './phase';
export type { Rep } from './rep';
export type { Set } from './set';
export type { TempoParts } from './tempo';
export type { LoadSettings } from './load';

// Load
export {
  DEFAULT_LOAD_SETTINGS,
  calculateFrameLoad,
  getEffectiveLoad,
} from './load';

// Phase
export {
  EMPTY_PHASE,
  addSampleToPhase,
  rebuildPhaseFromSamples,
  getPhaseDuration,
  getPhaseHoldDuration,
  getPhaseMovementDuration,
  getPhaseMeanVelocity,
  getPhaseMeanForce,
  getPhaseMeanLoad,
  getPhasePeakLoad,
  getPhaseRangeOfMotion,
} from './phase';

// Rep
export {
  createRep,
  addSampleToRep,
  isInEccentricPhase,
  getRepDuration,
  getRepTempo,
  getRepMeanVelocity,
  getRepPeakVelocity,
  getRepPeakForce,
  getRepMeanLoad,
  getRepPeakLoad,
  getRepRangeOfMotion,
  getRepSamples,
} from './rep';

// Set
export {
  createSet,
  addSampleToSet,
  completeSet,
  getSetLoad,
  getSetMeanLoad,
  getSetPeakLoad,
} from './set';

// Tempo
export { formatTempo, parseTempo } from './tempo';
