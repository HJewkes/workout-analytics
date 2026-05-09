/**
 * Analytics module - Rep and Set analytics for VBT autoregulation.
 */

// Types
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
} from './types';

// Rep Analytics
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
} from './rep-analytics';

// Set Analytics
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
} from './set-analytics';

// Quality
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
} from './quality';

// Fatigue
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
} from './fatigue';

// Intensity
export {
  estimatePerRepRIR,
  getRepHardnessWeight,
  getSetIntensityScore,
  getSetStimulusScore,
} from './intensity';

// Coverage
export {
  type SetSummary,
  type CoverageBin,
  buildCoverageMap,
  detectStaleBins,
} from './coverage';

// Session
export {
  type StrengthEstimate,
  type ReadinessEstimate,
  type SessionFatigueEstimate,
  computeStrengthEstimate,
  computeReadiness,
  computeSessionFatigue,
  computeVolume,
  computeEffectiveVolume,
} from './session';

// Readiness Adjustments
export {
  type ReadinessAdjustments,
  type ReadinessAdjustmentInputs,
  computeReadinessAdjustments,
} from './readiness-adjustments';

// Trend
export {
  type TimeSeriesPoint,
  type TimeSeries,
  type TrendAnalysis,
  type PlateauDetection,
  analyzeTrend,
  detectPlateau,
} from './trend';
