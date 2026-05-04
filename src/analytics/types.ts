/**
 * Analytics Types - Core types for workout analytics.
 *
 * Provides Expectation (fixed or distribution-based), comparison results,
 * and technique baseline definitions.
 */

import { type StreamingDistribution, getMean, getZScore, getStdDev } from '@/stats/distribution';
import {
  classifyByBreakpoints,
  DEFAULT_OUTLIER_SCHEME,
  DEFAULT_CONFIDENCE_SCHEME,
} from '@/stats/schemes';
import type { BreakpointScheme } from '@/stats/schemes';

// =============================================================================
// Expectation Types
// =============================================================================

/**
 * An expectation can be either a fixed value or a distribution.
 * Used as a baseline for comparison.
 */
export type Expectation<T extends number = number> =
  | { kind: 'fixed'; value: T }
  | { kind: 'distribution'; dist: StreamingDistribution };

/**
 * Result of comparing an actual value to an expectation.
 */
export interface ComparisonResult {
  /** Ratio of actual to expected (actual / expected) */
  ratio: number;
  /** Z-score if expectation is a distribution, null otherwise */
  zScore: number | null;
  /** Whether the value is an outlier based on z-score */
  isOutlier: boolean;
  /** Confidence level based on distribution sample size */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Neutral change measurement between first and last values.
 * Direction interpretation is context-dependent.
 */
export interface ChangeResult {
  /** First value in sequence */
  first: number;
  /** Last value in sequence */
  last: number;
  /** Absolute change: last - first (can be positive or negative) */
  absoluteChange: number;
  /** Percent change: (last - first) / first × 100 (can be positive or negative) */
  percentChange: number;
  /** Z-score context if historical distribution available */
  zScore: number | null;
}

/**
 * Baseline expectations for technique assessment.
 * Used to compare rep/set metrics against expected values.
 */
export interface TechniqueBaseline {
  /** Expected range of motion */
  rom: Expectation;
  /** Expected eccentric phase duration (seconds) */
  eccentricTime: Expectation;
  /** Expected concentric phase duration (seconds) */
  concentricTime: Expectation;
  /** Expected mean concentric velocity (m/s) */
  meanVelocity: Expectation;
}

// =============================================================================
// Expectation Factory Functions
// =============================================================================

/**
 * Create a fixed expectation with a specific value.
 */
export function createFixedExpectation<T extends number>(value: T): Expectation<T> {
  return { kind: 'fixed', value };
}

/**
 * Create a distribution-based expectation.
 */
export function createDistributionExpectation(dist: StreamingDistribution): Expectation {
  return { kind: 'distribution', dist };
}

/**
 * Get the expected value from an expectation.
 * For fixed: returns the value.
 * For distribution: returns the mean.
 */
export function getExpectedValue(expectation: Expectation): number {
  if (expectation.kind === 'fixed') {
    return expectation.value;
  }
  return getMean(expectation.dist);
}

// =============================================================================
// Comparison Functions
// =============================================================================

/**
 * Schemes used for comparison classification.
 */
export interface ComparisonSchemes {
  /** Z-score threshold for outlier detection */
  outlier?: BreakpointScheme<boolean>;
  /** Sample count threshold for confidence */
  confidence?: BreakpointScheme<'high' | 'medium' | 'low'>;
}

/**
 * Compare an actual value to an expectation.
 */
export function compareToExpectation(
  actual: number,
  expectation: Expectation,
  schemes?: ComparisonSchemes
): ComparisonResult {
  const expected = getExpectedValue(expectation);
  const ratio = expected !== 0 ? actual / expected : 0;

  const outlierScheme = schemes?.outlier ?? DEFAULT_OUTLIER_SCHEME;
  const confidenceScheme = schemes?.confidence ?? DEFAULT_CONFIDENCE_SCHEME;

  if (expectation.kind === 'fixed') {
    return {
      ratio,
      zScore: null,
      isOutlier: false, // Can't determine outlier without distribution
      confidence: 'low', // Fixed values have low confidence by default
    };
  }

  const dist = expectation.dist;
  const zScore = getZScore(dist, actual);
  const absZScore = Math.abs(zScore);

  return {
    ratio,
    zScore,
    isOutlier: classifyByBreakpoints(absZScore, outlierScheme),
    confidence: classifyByBreakpoints(dist.n, confidenceScheme),
  };
}

// =============================================================================
// Change Result Functions
// =============================================================================

/**
 * Compute a change result between first and last values.
 * Optionally provide a distribution for z-score context.
 */
export function computeChange(
  first: number,
  last: number,
  changeDistribution?: StreamingDistribution
): ChangeResult {
  const absoluteChange = last - first;
  const percentChange = first !== 0 ? (absoluteChange / first) * 100 : 0;

  const zScore = changeDistribution ? getZScore(changeDistribution, percentChange) : null;

  return {
    first,
    last,
    absoluteChange,
    percentChange,
    zScore,
  };
}

// =============================================================================
// TechniqueBaseline Functions
// =============================================================================

/**
 * Options for creating a technique baseline.
 */
export interface TechniqueBaselineOptions {
  rom: number | StreamingDistribution;
  eccentricTime: number | StreamingDistribution;
  concentricTime: number | StreamingDistribution;
  meanVelocity: number | StreamingDistribution;
}

/**
 * Helper to convert a value or distribution to an Expectation.
 */
function toExpectation(value: number | StreamingDistribution): Expectation {
  if (typeof value === 'number') {
    return createFixedExpectation(value);
  }
  return createDistributionExpectation(value);
}

/**
 * Create a technique baseline from options.
 * Accepts either fixed values or distributions for each metric.
 */
export function createTechniqueBaseline(options: TechniqueBaselineOptions): TechniqueBaseline {
  return {
    rom: toExpectation(options.rom),
    eccentricTime: toExpectation(options.eccentricTime),
    concentricTime: toExpectation(options.concentricTime),
    meanVelocity: toExpectation(options.meanVelocity),
  };
}

/**
 * Check if an expectation is distribution-based (has sufficient data).
 */
export function hasDistribution(expectation: Expectation): boolean {
  return expectation.kind === 'distribution' && expectation.dist.n >= 2;
}

/**
 * Get the standard deviation from an expectation.
 * Returns 0 for fixed expectations or distributions with insufficient data.
 */
export function getExpectationStdDev(expectation: Expectation): number {
  if (expectation.kind === 'fixed') {
    return 0;
  }
  return getStdDev(expectation.dist);
}
