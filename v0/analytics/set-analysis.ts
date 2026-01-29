/**
 * Set Analysis
 *
 * Provides fatigue detection and effort estimation for a single set.
 * Replaces v0 SetAggregator Tiers 2-3.
 *
 * Data flow:
 *   VelocityDelta → FatigueAnalysis → EffortEstimate
 */
import type { ExpectedVelocity } from './expected-velocity';

// ============================================================
// Types
// ============================================================

/**
 * Velocity change from expected.
 * Positive delta = faster than expected, negative = slower.
 */
export interface VelocityDelta {
  /** % change in concentric velocity from expected (negative = slowing/fatigue) */
  readonly concentric: number;
  /** % change in eccentric velocity from expected (positive = speeding up/loss of control) */
  readonly eccentric: number;
}

/**
 * Configuration for fatigue analysis.
 */
export interface FatigueConfig {
  /** Weight for concentric velocity in fatigue calculation (default: 0.6) */
  readonly concentricWeight: number;
  /** Weight for eccentric velocity in fatigue calculation (default: 0.4) */
  readonly eccentricWeight: number;
  /** Penalty multiplier for eccentric speedup (default: 1.5) */
  readonly eccentricSpeedupPenalty: number;
}

/**
 * Default fatigue configuration.
 */
export const DEFAULT_FATIGUE_CONFIG: FatigueConfig = {
  concentricWeight: 0.6,
  eccentricWeight: 0.4,
  eccentricSpeedupPenalty: 1.5,
};

/**
 * Fatigue analysis results.
 * Pattern detection from velocity changes.
 */
export interface FatigueAnalysis {
  /** Composite fatigue score (0-100) */
  readonly fatigueIndex: number;
  /** Eccentric control quality (0-100, higher = better) */
  readonly eccentricControlScore: number;
  /** Form warning message (null if form looks good) */
  readonly formWarning: string | null;
}

/**
 * Effort estimation (RIR/RPE prediction).
 */
export interface EffortEstimate {
  /** Estimated reps in reserve (0-6+) */
  readonly rir: number;
  /** Rate of perceived exertion (4-10) */
  readonly rpe: number;
  /** Confidence in the estimate */
  readonly confidence: 'high' | 'medium' | 'low';
}

// ============================================================
// Velocity Comparison
// ============================================================

/**
 * Observed velocity for comparison.
 */
export interface ObservedVelocity {
  readonly concentric: number;
  readonly eccentric: number;
}

/**
 * Compute velocity delta (% change from expected).
 *
 * @param observed - Observed velocity (typically last rep)
 * @param expected - Expected velocity from baseline
 * @returns Velocity delta as percentages
 */
export function computeVelocityDelta(
  observed: ObservedVelocity,
  expected: ExpectedVelocity
): VelocityDelta {
  const concentricDelta = computeDelta(observed.concentric, expected.concentric);
  const eccentricDelta = computeDelta(observed.eccentric, expected.eccentric);

  return { concentric: concentricDelta, eccentric: eccentricDelta };
}

function computeDelta(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / baseline) * 100;
}

// ============================================================
// Fatigue Analysis (Tier 2)
// ============================================================

/**
 * Compute fatigue analysis from velocity delta.
 *
 * @param delta - Velocity delta from expected
 * @param config - Fatigue calculation config
 * @returns Fatigue analysis with index, control score, and warnings
 */
export function computeFatigueAnalysis(
  delta: VelocityDelta,
  config: FatigueConfig = DEFAULT_FATIGUE_CONFIG
): FatigueAnalysis {
  const fatigueIndex = computeFatigueIndex(delta, config);
  const eccentricControlScore = computeEccentricControlScore(delta.eccentric);
  const formWarning = generateFormWarning(delta, eccentricControlScore);

  return {
    fatigueIndex,
    eccentricControlScore,
    formWarning,
  };
}

/**
 * Compute composite fatigue index (0-100).
 *
 * - Concentric slowing (negative delta) contributes to fatigue
 * - Eccentric speeding up (positive delta) contributes with penalty
 */
function computeFatigueIndex(delta: VelocityDelta, config: FatigueConfig): number {
  // Concentric slowing (negative delta) contributes to fatigue
  const concentricFatigue = Math.max(0, -delta.concentric);

  // Eccentric speeding up (positive delta) contributes with penalty
  const eccentricFatigue = Math.max(0, delta.eccentric) * config.eccentricSpeedupPenalty;

  const rawIndex =
    concentricFatigue * config.concentricWeight + eccentricFatigue * config.eccentricWeight;

  return Math.min(100, rawIndex);
}

/**
 * Compute eccentric control score (0-100).
 * Higher score = better control (eccentric not speeding up).
 */
function computeEccentricControlScore(eccentricDelta: number): number {
  return Math.max(0, 100 - eccentricDelta * 2);
}

/**
 * Generate form warning based on velocity patterns.
 */
function generateFormWarning(delta: VelocityDelta, controlScore: number): string | null {
  if (controlScore < 40) {
    return 'Eccentric control declining - slow the negative';
  }
  if (delta.eccentric > 30 && delta.concentric < -10) {
    return 'Grinding with loss of control - consider ending set';
  }
  return null;
}

// ============================================================
// Effort Estimation (Tier 3)
// ============================================================

/**
 * Estimate effort (RIR/RPE) from fatigue analysis.
 *
 * @param fatigue - Fatigue analysis results
 * @returns Effort estimate with RIR, RPE, and confidence
 */
export function estimateEffort(fatigue: FatigueAnalysis): EffortEstimate {
  const { fatigueIndex, eccentricControlScore } = fatigue;

  // Base RIR estimation from fatigue index
  // fatigueIndex 0 = ~6 RIR, fatigueIndex 78+ = 0 RIR
  let rir = Math.max(0, 6 - fatigueIndex / 13);

  // Adjust for poor eccentric control (indicates closer to failure)
  if (eccentricControlScore < 50) {
    rir = Math.max(0, rir - 1);
  }

  // RPE = 10 - RIR (capped at 4-10 range)
  const rpe = Math.min(10, Math.max(4, 10 - rir));

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (fatigueIndex > 50 && eccentricControlScore < 60) {
    confidence = 'high'; // Clear fatigue signal
  } else if (fatigueIndex < 20) {
    confidence = 'low'; // Not enough data yet
  }

  return {
    rir: Math.round(rir * 2) / 2, // Round to nearest 0.5
    rpe: Math.round(rpe * 2) / 2,
    confidence,
  };
}

// ============================================================
// Convenience Functions
// ============================================================

/**
 * Full set analysis pipeline.
 * Combines velocity comparison, fatigue analysis, and effort estimation.
 */
export interface SetAnalysisResult {
  readonly delta: VelocityDelta;
  readonly fatigue: FatigueAnalysis;
  readonly effort: EffortEstimate;
}

/**
 * Analyze a set given observed and expected velocities.
 *
 * @param observed - Observed velocity (typically last rep)
 * @param expected - Expected velocity from baseline
 * @param config - Optional fatigue config
 * @returns Complete set analysis
 */
export function analyzeSetVelocity(
  observed: ObservedVelocity,
  expected: ExpectedVelocity,
  config: FatigueConfig = DEFAULT_FATIGUE_CONFIG
): SetAnalysisResult {
  const delta = computeVelocityDelta(observed, expected);
  const fatigue = computeFatigueAnalysis(delta, config);
  const effort = estimateEffort(fatigue);

  return { delta, fatigue, effort };
}
