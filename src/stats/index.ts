/**
 * Stats module - Streaming statistics and classification schemes.
 */

// Distribution
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
} from './distribution';

// Grubbs' test for a single outlier
export {
  GRUBBS_DEFAULT_ALPHA,
  grubbsCriticalValue,
  isGrubbsOutlier,
  maxAbsZScore,
  studentTTwoSidedTail,
} from './grubbs';

// Schemes
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
} from './schemes';
