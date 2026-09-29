/**
 * Workout models - hardware-agnostic exercise data structures.
 */

// Enums and constants
export { MovementPhase, PhaseNames } from './types.js';

// Types
export type { WorkoutSample } from './sample.js';
export type { Phase } from './phase.js';
export type { Rep } from './rep.js';
export type { Set, AddSampleToSetOptions } from './set.js';
export type { TempoParts } from './tempo.js';
export type { LoadSettings } from './load.js';
export type { BaselineKey, BaselineKeyFilter, BaselineSide } from './baseline-key.js';

// Baseline identity
export { baselineKeyId, matchesBaselineKey, baselineKeyEquals } from './baseline-key.js';

// Load
export { DEFAULT_LOAD_SETTINGS, calculateFrameLoad, getEffectiveLoad } from './load.js';

// Phase
export {
  EMPTY_PHASE,
  isHoldOrIdleSample,
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
  getPhaseTimeToPeakVelocityMs,
  getPhaseVelocityDropPct,
  getPhaseVelocityEnvelope,
} from './phase.js';

// Rep
export {
  createRep,
  addSampleToRep,
  isInEccentricPhase,
  getRepDuration,
  getRepTempo,
  getRepTempoRatio,
  getRepHoldTopMs,
  getRepMeanVelocity,
  getRepPeakVelocity,
  getRepPeakForce,
  getRepMeanLoad,
  getRepPeakLoad,
  getRepRangeOfMotion,
  getRepSamples,
} from './rep.js';

// Set
export {
  createSet,
  addSampleToSet,
  completeSet,
  getSetLoad,
  getSetMeanLoad,
  getSetPeakLoad,
} from './set.js';

// Tempo
export { formatTempo, parseTempo } from './tempo.js';
