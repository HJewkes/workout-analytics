/**
 * VBT (Velocity-Based Training) module.
 *
 * Pure functions for load-velocity profiling, 1RM estimation,
 * coverage tracking, and velocity baselines.
 */

// Constants
export {
  VELOCITY_AT_PERCENT_1RM,
  DEFAULT_MVT,
  DEFAULT_VELOCITY_RIR_MAP,
  estimatePercent1RMFromVelocity,
  categorizeVelocity,
  type VelocityZone,
} from './constants';

// Profile
export {
  type LoadVelocityDataPoint,
  type LoadVelocityProfile,
  buildProfile,
  predictVelocity,
  estimateLoad,
  addDataPoint,
} from './profile';

// Baseline
export { type VelocityBaseline, buildBaseline, getExpectedVelocity } from './baseline';

// e1RM Estimation
export {
  type E1RMEstimate,
  estimateE1RMFromProfile,
  estimateE1RMFromReps,
  estimateHybridE1RM,
} from './e1rm';

// Coverage
export {
  type CoverageBin,
  type CoverageResult,
  computeCoverage,
  identifyCoverageGaps,
} from './coverage';

// Advanced Profile Fitting
export { type FittingOptions, type FittingResult, fitLVProfile } from './profile-fitting';

// Exercise-Specific RIR Estimation
export {
  type ExerciseTypeId,
  type ExerciseVBTProfile,
  type RIREstimateInputs,
  type ExerciseRIREstimate,
  estimateRIRWithProfile,
  DEFAULT_CABLE_COMPOUND_PROFILE,
  DEFAULT_CABLE_ISOLATION_PROFILE,
  DEFAULT_FALLBACK_PROFILE,
} from './rir-exercise-specific';
