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
  type WorkoutSample,

  // Load
  type LoadSettings,
  DEFAULT_LOAD_SETTINGS,
  calculateFrameLoad,
  getEffectiveLoad,

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
  getPhaseMeanLoad,
  getPhasePeakLoad,
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
  getRepMeanLoad,
  getRepPeakLoad,
  getRepRangeOfMotion,
  getRepSamples,

  // Set
  type Set,
  createSet,
  addSampleToSet,
  completeSet,
  getSetLoad,
  getSetMeanLoad,
  getSetPeakLoad,

  // Tempo
  type TempoParts,
  formatTempo,
  parseTempo,
} from './models';

// Stats - Distribution
export {
  type StreamingDistribution,
  EMPTY_DISTRIBUTION,
  createDistribution,
  addSample,
  mergeDist,
  getMean,
  getVariance,
  getStdDev,
  getZScore,
  getCV,
  isOutlier,
  isWithinRange,
  buildDistribution,
} from './stats';

// Stats - Schemes
export {
  type BreakpointScheme,
  type InterpolationScheme,
  classifyByBreakpoints,
  interpolate,
  createBreakpointScheme,
  createInterpolationScheme,
  DEFAULT_RIR_SCHEME,
  DEFAULT_CONSISTENCY_SCHEME,
  DEFAULT_OUTLIER_SCHEME,
  DEFAULT_QUALITY_SCHEME,
  DEFAULT_CONFIDENCE_SCHEME,
} from './stats';

// Analytics - Types
export {
  type Expectation,
  type ComparisonResult,
  type ChangeResult,
  type TechniqueBaseline,
  type ComparisonSchemes,
  type TechniqueBaselineOptions,
  createFixedExpectation,
  createDistributionExpectation,
  getExpectedValue,
  compareToExpectation,
  computeChange,
  createTechniqueBaseline,
  hasDistribution,
  getExpectationStdDev,
} from './analytics';

// Analytics - Rep
export {
  getRepMeanEccentricVelocity,
  getRepMeanConcentricForce,
  getRepPeakConcentricForce,
  getRepMeanEccentricForce,
  getRepPeakEccentricForce,
  getRepConcentricTime,
  getRepEccentricTime,
  getRepImpulse,
  getRepWork,
  getRepTotalImpulse,
  getRepConcentricImpulse,
  getRepEccentricImpulse,
  getRepTotalWork,
  getRepConcentricWork,
  getRepEccentricWork,
  getRepMeanConcentricPower,
  getRepMeanEccentricPower,
} from './analytics';

// Analytics - Set
export {
  getSetFirstRepVelocity,
  getSetLastRepVelocity,
  getSetBestRepVelocity,
  getSetVelocityLossPct,
  getSetMeanVelocity,
  getSetPeakVelocity,
  getSetRepVelocities,
  getSetFirstRepEccentricVelocity,
  getSetLastRepEccentricVelocity,
  getSetMeanEccentricVelocity,
  getSetRepEccentricVelocities,
  getSetEccentricVelocityChangePct,
  getSetMeanROM,
  getSetBestROM,
  getSetFirstRepROM,
  getSetLastRepROM,
  getSetRepROMs,
  getSetRepVelocityAt,
  getSetRepROMAt,
  type SetVelocitySummary,
  getSetVelocitySummary,
} from './analytics';

// Analytics - Quality
export {
  type RepQualityFlags,
  type QualitySchemes,
  type RepQualityAssessment,
  DEFAULT_PARTIAL_REP_SCHEME,
  DEFAULT_ECC_RUSHED_SCHEME,
  assessRepROM,
  assessRepEccentricControl,
  assessRepVelocity,
  getRepQualityFlags,
  isPartialRep,
  isEccentricRushed,
  getRepROMRatio,
  getRepEccentricTimeRatio,
  getRepVelocityRatio,
  assessRepQuality,
} from './analytics';

// Analytics - Fatigue
export {
  type FatigueSchemes,
  type FatigueIndex,
  type ConsistencyScore,
  type RIREstimate,
  type OutlierRep,
  type FatigueSummary,
  type EccentricControl,
  type SetFatigueIndexResult,
  DEFAULT_FATIGUE_WEIGHTS,
  VBT_DEFAULT_FATIGUE_WEIGHTS,
  VBT_DEFAULT_FATIGUE_LAMBDA,
  getSetVelocityChange,
  getSetTempoChange,
  getSetROMChange,
  getSetEccentricVelocityChange,
  getSetEccentricControlScore,
  getSetFormWarning,
  getSetEccentricControl,
  getSetFatigueIndex,
  getSetVelocityDistribution,
  getSetROMDistribution,
  getSetTempoDistribution,
  getSetConsistencyScore,
  findOutlierReps,
  estimateSetRIR,
  isSetFatigued,
  getSetFatigueSummary,
  computeSetFatigueIndex,
  updateSessionFatigueState,
} from './analytics';

// Analytics - Intensity
export {
  estimatePerRepRIR,
  getRepHardnessWeight,
  getSetIntensityScore,
  getSetStimulusScore,
} from './analytics';

// Analytics - Session
export {
  type StrengthEstimate,
  type ReadinessEstimate,
  type SessionFatigueEstimate,
  computeStrengthEstimate,
  computeReadiness,
  computeSessionFatigue,
  computeVolume,
  computeEffectiveVolume,
} from './analytics';

// VBT - Constants
export {
  VELOCITY_AT_PERCENT_1RM,
  DEFAULT_MVT,
  DEFAULT_VELOCITY_RIR_MAP,
  estimatePercent1RMFromVelocity,
  categorizeVelocity,
  type VelocityZone,
} from './vbt';

// VBT - Profile
export {
  type LoadVelocityDataPoint,
  type LoadVelocityProfile,
  buildProfile,
  predictVelocity,
  estimateLoad,
  addDataPoint,
} from './vbt';

// VBT - Baseline
export { type VelocityBaseline, buildBaseline, getExpectedVelocity } from './vbt';

// VBT - e1RM
export {
  type E1RMEstimate,
  estimateE1RMFromProfile,
  estimateE1RMFromReps,
  estimateHybridE1RM,
} from './vbt';

// VBT - Coverage
export {
  type CoverageBin,
  type CoverageResult,
  computeCoverage,
  identifyCoverageGaps,
} from './vbt';

// VBT - Advanced Fitting
export { type FittingOptions, type FittingResult, fitLVProfile } from './vbt';

// Exercises
export {
  type Exercise,
  type MuscleGroupId,
  type MovementPatternId,
  type EquipmentCategory,
  type EquipmentInfo,
  type CableSetup,
  setCatalog,
  loadCatalog,
  getExerciseById,
  getAllExercises,
  getExercisesByMuscleGroup,
  getExercisesByMovementPattern,
  getExercisesByEquipment,
  getCableExercises,
  searchExercises,
  hasExercise,
  getExerciseCount,
} from './exercises';
