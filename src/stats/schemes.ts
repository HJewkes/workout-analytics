/**
 * Classification Schemes - Configurable threshold-based classification.
 *
 * Replaces hardcoded thresholds with data structures that can be:
 * - Configured per user/exercise
 * - Learned from labeled data
 * - Serialized and versioned
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Breakpoint-based classification scheme.
 * Maps a numeric value to a category T.
 *
 * Breakpoints are evaluated in order; the first breakpoint where
 * `value < below` determines the output. If no breakpoint matches,
 * `fallback` is returned.
 *
 * @example
 * // Classify z-score as outlier
 * const outlierScheme: BreakpointScheme<boolean> = {
 *   breakpoints: [{ below: 2.0, value: false }],
 *   fallback: true,  // |z| >= 2.0 is outlier
 * };
 */
export interface BreakpointScheme<T> {
  readonly breakpoints: ReadonlyArray<{ below: number; value: T }>;
  readonly fallback: T;
}

/**
 * Interpolation scheme for numeric outputs.
 * Linear interpolation between defined points, clamped at edges.
 *
 * Points must be sorted by input value in ascending order.
 *
 * @example
 * // Velocity loss % to RIR
 * const rirScheme: InterpolationScheme = {
 *   points: [
 *     { input: 0, output: 6 },
 *     { input: 60, output: 0 },
 *   ],
 * };
 */
export interface InterpolationScheme {
  readonly points: ReadonlyArray<{ input: number; output: number }>;
}

// =============================================================================
// Classification Functions
// =============================================================================

/**
 * Classify a value using a breakpoint scheme.
 * Returns the value from the first breakpoint where `value < below`,
 * or the fallback if no breakpoint matches.
 */
export function classifyByBreakpoints<T>(value: number, scheme: BreakpointScheme<T>): T {
  for (const bp of scheme.breakpoints) {
    if (value < bp.below) {
      return bp.value;
    }
  }
  return scheme.fallback;
}

/**
 * Interpolate a value using an interpolation scheme.
 * Linear interpolation between points, clamped at edges.
 *
 * @throws Error if scheme has no points
 */
export function interpolate(value: number, scheme: InterpolationScheme): number {
  const { points } = scheme;

  if (points.length === 0) {
    throw new Error('InterpolationScheme must have at least one point');
  }

  if (points.length === 1) {
    return points[0].output;
  }

  // Clamp below first point
  if (value <= points[0].input) {
    return points[0].output;
  }

  // Clamp above last point
  if (value >= points[points.length - 1].input) {
    return points[points.length - 1].output;
  }

  // Find bracketing points and interpolate
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    if (value >= p1.input && value <= p2.input) {
      const t = (value - p1.input) / (p2.input - p1.input);
      return p1.output + t * (p2.output - p1.output);
    }
  }

  // Should never reach here if points are sorted
  return points[points.length - 1].output;
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a breakpoint scheme from breakpoints and fallback.
 */
export function createBreakpointScheme<T>(
  breakpoints: Array<{ below: number; value: T }>,
  fallback: T
): BreakpointScheme<T> {
  return {
    breakpoints: [...breakpoints].sort((a, b) => a.below - b.below),
    fallback,
  };
}

/**
 * Create an interpolation scheme from points.
 * Points are sorted by input value.
 */
export function createInterpolationScheme(
  points: Array<{ input: number; output: number }>
): InterpolationScheme {
  return {
    points: [...points].sort((a, b) => a.input - b.input),
  };
}

// =============================================================================
// Default Scheme Constants
// =============================================================================

/**
 * RIR estimation from velocity loss percentage.
 * Based on VBT research with conservative values for cable machines.
 *
 * - 0% loss → RIR 6 (very fresh)
 * - 10% loss → RIR 5
 * - 20% loss → RIR 4
 * - 30% loss → RIR 3
 * - 40% loss → RIR 2
 * - 50% loss → RIR 1
 * - 60%+ loss → RIR 0 (failure)
 */
export const DEFAULT_RIR_SCHEME: InterpolationScheme = {
  points: [
    { input: 0, output: 6 },
    { input: 10, output: 5 },
    { input: 20, output: 4 },
    { input: 30, output: 3 },
    { input: 40, output: 2 },
    { input: 50, output: 1 },
    { input: 60, output: 0 },
  ],
};

/**
 * Consistency classification from coefficient of variation (CV).
 *
 * - CV < 10% → stable (very consistent)
 * - CV < 20% → variable (some variation)
 * - CV >= 20% → erratic (high variation)
 */
export const DEFAULT_CONSISTENCY_SCHEME: BreakpointScheme<'stable' | 'variable' | 'erratic'> = {
  breakpoints: [
    { below: 0.1, value: 'stable' },
    { below: 0.2, value: 'variable' },
  ],
  fallback: 'erratic',
};

/**
 * Outlier detection from absolute z-score.
 *
 * - |z| < 2.0 → not an outlier
 * - |z| >= 2.0 → outlier
 */
export const DEFAULT_OUTLIER_SCHEME: BreakpointScheme<boolean> = {
  breakpoints: [{ below: 2.0, value: false }],
  fallback: true,
};

/**
 * Quality classification from ratio (actual / expected).
 *
 * - ratio < 0.80 → poor (significantly below expected)
 * - ratio < 0.95 → warning (slightly below expected)
 * - ratio >= 0.95 → good (at or above expected)
 */
export const DEFAULT_QUALITY_SCHEME: BreakpointScheme<'good' | 'warning' | 'poor'> = {
  breakpoints: [
    { below: 0.8, value: 'poor' },
    { below: 0.95, value: 'warning' },
  ],
  fallback: 'good',
};

/**
 * Confidence classification from sample count.
 *
 * - n < 5 → low confidence
 * - n < 20 → medium confidence
 * - n >= 20 → high confidence
 */
export const DEFAULT_CONFIDENCE_SCHEME: BreakpointScheme<'high' | 'medium' | 'low'> = {
  breakpoints: [
    { below: 5, value: 'low' },
    { below: 20, value: 'medium' },
  ],
  fallback: 'high',
};
