/**
 * Rep Quality Analytics - Second-order analytics for rep quality assessment.
 *
 * These functions assess rep quality by comparing metrics against expectations,
 * using configurable schemes for classification.
 */

import type { Rep } from '@/models/rep';
import { getRepRangeOfMotion, getRepMeanVelocity } from '@/models/rep';
import type { Expectation, ComparisonResult, TechniqueBaseline, ComparisonSchemes } from '@/analytics/types';
import { compareToExpectation, getExpectedValue } from '@/analytics/types';
import { getRepEccentricTime } from '@/analytics/rep-analytics';
import {
  classifyByBreakpoints,
  DEFAULT_OUTLIER_SCHEME,
  DEFAULT_QUALITY_SCHEME,
  type BreakpointScheme,
} from '@/stats/schemes';

// =============================================================================
// Types
// =============================================================================

/**
 * Quality flags for a single rep.
 */
export interface RepQualityFlags {
  /** ROM significantly below expected */
  partialRep: boolean;
  /** Eccentric phase was rushed (too fast) */
  eccRushed: boolean;
  /** Velocity is a statistical outlier */
  velocityOutlier: boolean;
  /** Overall quality assessment */
  overallQuality: 'good' | 'warning' | 'poor';
}

/**
 * Schemes used for quality assessment.
 */
export interface QualitySchemes extends ComparisonSchemes {
  /** Z-score threshold for outlier detection */
  outlier?: BreakpointScheme<boolean>;
  /** Ratio threshold for quality classification */
  quality?: BreakpointScheme<'good' | 'warning' | 'poor'>;
  /** Ratio threshold for partial rep detection */
  partialRep?: BreakpointScheme<boolean>;
  /** Ratio threshold for rushed eccentric detection */
  eccRushed?: BreakpointScheme<boolean>;
}

/**
 * Default scheme for partial rep detection (ROM < 80% = partial).
 */
export const DEFAULT_PARTIAL_REP_SCHEME: BreakpointScheme<boolean> = {
  breakpoints: [{ below: 0.8, value: true }],
  fallback: false,
};

/**
 * Default scheme for rushed eccentric detection (time < 60% = rushed).
 */
export const DEFAULT_ECC_RUSHED_SCHEME: BreakpointScheme<boolean> = {
  breakpoints: [{ below: 0.6, value: true }],
  fallback: false,
};

// =============================================================================
// Individual Assessment Functions
// =============================================================================

/**
 * Assess rep ROM against expectation.
 */
export function assessRepROM(
  rep: Rep,
  expectation: Expectation,
  schemes?: QualitySchemes
): ComparisonResult {
  const actual = getRepRangeOfMotion(rep);
  return compareToExpectation(actual, expectation, schemes);
}

/**
 * Assess rep eccentric control (time) against expectation.
 */
export function assessRepEccentricControl(
  rep: Rep,
  expectation: Expectation,
  schemes?: QualitySchemes
): ComparisonResult {
  const actual = getRepEccentricTime(rep);
  return compareToExpectation(actual, expectation, schemes);
}

/**
 * Assess rep velocity against expectation.
 */
export function assessRepVelocity(
  rep: Rep,
  expectation: Expectation,
  schemes?: QualitySchemes
): ComparisonResult {
  const actual = getRepMeanVelocity(rep);
  return compareToExpectation(actual, expectation, schemes);
}

// =============================================================================
// Aggregate Quality Assessment
// =============================================================================

/**
 * Get quality flags for a rep based on technique baseline.
 */
export function getRepQualityFlags(
  rep: Rep,
  baseline: TechniqueBaseline,
  schemes?: QualitySchemes
): RepQualityFlags {
  const romResult = assessRepROM(rep, baseline.rom, schemes);
  const eccResult = assessRepEccentricControl(rep, baseline.eccentricTime, schemes);
  const velResult = assessRepVelocity(rep, baseline.meanVelocity, schemes);

  const partialRepScheme = schemes?.partialRep ?? DEFAULT_PARTIAL_REP_SCHEME;
  const eccRushedScheme = schemes?.eccRushed ?? DEFAULT_ECC_RUSHED_SCHEME;
  const outlierScheme = schemes?.outlier ?? DEFAULT_OUTLIER_SCHEME;
  const qualityScheme = schemes?.quality ?? DEFAULT_QUALITY_SCHEME;

  // Determine individual flags
  const partialRep = classifyByBreakpoints(romResult.ratio, partialRepScheme);
  const eccRushed = classifyByBreakpoints(eccResult.ratio, eccRushedScheme);
  const velocityOutlier =
    velResult.zScore !== null && classifyByBreakpoints(Math.abs(velResult.zScore), outlierScheme);

  // Determine overall quality based on the worst metric
  const minRatio = Math.min(romResult.ratio, eccResult.ratio, velResult.ratio);
  const overallQuality = classifyByBreakpoints(minRatio, qualityScheme);

  return {
    partialRep,
    eccRushed,
    velocityOutlier,
    overallQuality,
  };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick check if a rep is a partial rep (ROM below threshold).
 */
export function isPartialRep(
  rep: Rep,
  expectedROM: number,
  threshold: number = 0.8
): boolean {
  const actual = getRepRangeOfMotion(rep);
  return actual < expectedROM * threshold;
}

/**
 * Quick check if eccentric was rushed (time below threshold).
 */
export function isEccentricRushed(
  rep: Rep,
  expectedEccTime: number,
  threshold: number = 0.6
): boolean {
  const actual = getRepEccentricTime(rep);
  return actual < expectedEccTime * threshold;
}

/**
 * Get ROM ratio (actual / expected).
 */
export function getRepROMRatio(rep: Rep, expectedROM: number): number {
  if (expectedROM === 0) return 0;
  return getRepRangeOfMotion(rep) / expectedROM;
}

/**
 * Get eccentric time ratio (actual / expected).
 */
export function getRepEccentricTimeRatio(rep: Rep, expectedEccTime: number): number {
  if (expectedEccTime === 0) return 0;
  return getRepEccentricTime(rep) / expectedEccTime;
}

/**
 * Get velocity ratio (actual / expected).
 */
export function getRepVelocityRatio(rep: Rep, expectedVelocity: number): number {
  if (expectedVelocity === 0) return 0;
  return getRepMeanVelocity(rep) / expectedVelocity;
}

// =============================================================================
// Quality Summary
// =============================================================================

/**
 * Detailed quality assessment for a rep.
 */
export interface RepQualityAssessment {
  flags: RepQualityFlags;
  romComparison: ComparisonResult;
  eccentricComparison: ComparisonResult;
  velocityComparison: ComparisonResult;
}

/**
 * Get a detailed quality assessment for a rep.
 */
export function assessRepQuality(
  rep: Rep,
  baseline: TechniqueBaseline,
  schemes?: QualitySchemes
): RepQualityAssessment {
  const romComparison = assessRepROM(rep, baseline.rom, schemes);
  const eccentricComparison = assessRepEccentricControl(rep, baseline.eccentricTime, schemes);
  const velocityComparison = assessRepVelocity(rep, baseline.meanVelocity, schemes);
  const flags = getRepQualityFlags(rep, baseline, schemes);

  return {
    flags,
    romComparison,
    eccentricComparison,
    velocityComparison,
  };
}
