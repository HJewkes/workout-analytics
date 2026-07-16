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
  getPhaseTimeToPeakVelocityMs,
  getPhaseVelocityDropPct,
  getPhaseVelocityEnvelope,

  // Rep
  type Rep,
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

  // Set
  type Set,
  type AddSampleToSetOptions,
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
  type VBTSetFatigueIndexResult,
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
  computeVBTSetFatigueIndex,
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

// Analytics - Readiness Adjustments
export {
  type ReadinessAdjustments,
  type ReadinessAdjustmentInputs,
  computeReadinessAdjustments,
} from './analytics';

// Analytics - Trend
export {
  type TimeSeriesPoint,
  type TimeSeries,
  type TrendAnalysis,
  type PlateauDetection,
  analyzeTrend,
  detectPlateau,
} from './analytics';

// Analytics - State-Space Strength Model
export {
  type StrengthState,
  type StateSpaceStrengthModelOptions,
  StateSpaceStrengthModel,
  DEFAULT_PROCESS_NOISE_LEVEL,
  DEFAULT_PROCESS_NOISE_TREND,
  DEFAULT_OBSERVATION_NOISE,
  DEFAULT_DIFFUSE_VARIANCE,
} from './analytics';

// VBT - Constants
export {
  VELOCITY_AT_PERCENT_1RM,
  DEFAULT_MVT,
  DEFAULT_VELOCITY_RIR_MAP,
  estimatePercent1RMFromVelocity,
} from './vbt';

// VBT - Velocity Zones
export {
  type VelocityZoneId,
  type VelocityZone,
  type MovementClass,
  type VelocityZoneBand,
  type VelocityZones,
  type GetVelocityZonesOptions,
  getVelocityZones,
  categorizeVelocity,
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
export {
  type VelocityBaseline,
  type SerializedBaseline,
  buildBaseline,
  getExpectedVelocity,
  updateBaselineWithPoint,
  serializeBaseline,
  deserializeBaseline,
} from './vbt';

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

// VBT - Bayesian LV Profile Fitting
export { type BayesianLVPrior, type BayesianLVPosterior, fitLVProfileBayesian } from './vbt';

// VBT - Exercise-Specific RIR Estimation
export {
  type ExerciseTypeId,
  type ExerciseVBTProfile,
  type RIREstimateInputs,
  type ExerciseRIREstimate,
  estimateRIRWithProfile,
  DEFAULT_CABLE_COMPOUND_PROFILE,
  DEFAULT_CABLE_ISOLATION_PROFILE,
  DEFAULT_FALLBACK_PROFILE,
} from './vbt';

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

// Analytics - Coverage (autoregulation explorer, §9.1-§9.2)
export {
  type SetSummary,
  type CoverageBin as AnalyticsCoverageBin,
  buildCoverageMap,
  detectStaleBins,
} from './analytics';

// Analytics - Time Series (cross-session aggregation, T25)
export {
  type MetricTimeSeries,
  type MetricTimeSeriesPoint,
  type ProcessedSession,
  type ProcessedSet,
  buildTimeSeries,
} from './analytics';

// Analytics - View-Model Derivations (exact, unrounded metrics for workout views)
export {
  type E1RMSetInput,
  type VolumeLandmarks,
  type VolumeStatusName,
  type VelocityLossVerdict,
  estimateSetRpe,
  velocityLossVerdict,
  getSetRepPeakVelocities,
  getSetRepMeanVelocities,
  getSetTempoSeconds,
  bestE1RMAcrossSets,
  isNewE1RM,
  weightDeviationRatio,
  classifyWeeklyVolume,
} from './analytics';
