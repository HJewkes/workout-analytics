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
export { type SetSummary, type CoverageBin, buildCoverageMap, detectStaleBins } from './coverage';

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
  type AnalyzeTrendOptions,
  FLAT_THRESHOLD_PER_DAY,
  analyzeTrend,
  detectPlateau,
  slopeStandardError,
} from './trend';

// Lift Series (per-day top load at modal reps and best rep-based e1RM)
export {
  type LiftSetInput,
  type LiftSessionPoint,
  type LiftSeries,
  MAX_E1RM_REPS,
  buildLiftSeries,
  modalRepCount,
} from './lift-series';

// Week Segments (regular, broken and untrained weeks of a training history)
export {
  type SegmentRule,
  type BreakReason,
  type WeekLabel,
  type WeekSegmentFacts,
  type LabelledWeek,
  type TrainingRun,
  type LongGap,
  type WeekSegmentation,
  SEGMENT_RULE,
  BREAK_REASONS,
  segmentWeeks,
  sessionsPerWeek,
  modalWeeklyCount,
} from './week-segments';

// Progression Rate (in-block and start-to-start rates per class)
export {
  type ProgressionPoint,
  type ProgressionSeriesInput,
  type ProgressionBlock,
  type LiftProgressionRate,
  type SlopeSummary,
  type ClassProgressionRate,
  type ProgressionRates,
  DEFAULT_PROGRESSION_PERIOD,
  progressionRateByClass,
} from './progression-rate';

// Training Age (per-lift break length and effective training age)
export { type DayGap } from './calendar-days';
export {
  type LiftBreak,
  type EffectiveTrainingAgeOptions,
  type TrainingAgeRun,
  type EffectiveTrainingAge,
  BREAK_THRESHOLD_DAYS,
  EFFECTIVE_TRAINING_AGE_DEFAULTS,
  breakLength,
  effectiveTrainingAge,
} from './training-age';

// Drift Guard (execution-comparability gate for cross-session comparisons)
export {
  type DriftSummary,
  type DriftGuardVerdict,
  type DriftGuardOptions,
  DRIFT_GUARD_THRESHOLDS,
  summarizeSetsForDrift,
  evaluateDriftGuard,
} from './drift-guard';

// MRV Underperformance (two-session underperformance detector, drift-gated)
export {
  type WeightedSet,
  type PerformanceSummary,
  type MrvUnderperformanceVerdict,
  type MrvGuardVerdict,
  MRV_UNDERPERFORMANCE_THRESHOLDS,
  summarizeSetsForPerformance,
  evaluateMrvUnderperformance,
  evaluateMrvGuard,
} from './mrv-underperformance';

// State-Space Strength Model
export {
  type StrengthState,
  type StateSpaceStrengthModelOptions,
  StateSpaceStrengthModel,
  DEFAULT_PROCESS_NOISE_LEVEL,
  DEFAULT_PROCESS_NOISE_TREND,
  DEFAULT_OBSERVATION_NOISE,
  DEFAULT_DIFFUSE_VARIANCE,
} from './state-space-strength';

// Time Series (cross-session aggregation)
export {
  type MetricKey,
  type BuildTimeSeriesConfig,
  type WeeklySummary,
  type VolumeByMuscleGroup,
  type ProcessedSession,
  type ProcessedSet,
  type MetricTimeSeries,
  type MetricTimeSeriesPoint,
  buildTimeSeries,
  getWeeklySummaries,
  getVolumeByMuscleGroup,
} from './time-series';

// Fatigue Verdict (always-on live set verdict + per-dimension lights)
export {
  type DimensionTone,
  type FatigueVerdictState,
  type FatigueVerdict,
  type FatigueVerdictSchemes,
  DEFAULT_ROM_BREAKDOWN_SCHEME,
  DEFAULT_ECCENTRIC_BREAKDOWN_SCHEME,
  DEFAULT_CONCENTRIC_GRIND_SCHEME,
  getSetWorkingROM,
  velocityLossTone,
  romBreakdownTone,
  tempoBreakdownTone,
  getSetFatigueVerdict,
} from './fatigue-verdict';

// View-Model Derivations (exact, unrounded metrics for rendering workout views)
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
} from './view-model';
