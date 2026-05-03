/**
 * VBT Constants - Research-backed reference data for velocity-based training.
 *
 * No TrainingGoal concept -- consumers pass their own thresholds.
 * Uses InterpolationScheme for the RIR mapping so it's configurable.
 */

import { type InterpolationScheme, createInterpolationScheme } from '@/stats/schemes';

// =============================================================================
// Types
// =============================================================================

export type VelocityZone = 'fast' | 'moderate' | 'slow' | 'grinding';

// =============================================================================
// Constants
// =============================================================================

/**
 * Mean concentric velocity at different %1RM (Gonzalez-Badillo et al.).
 * Values represent typical mean velocity in m/s for compound exercises.
 *
 * These are population averages; individual variation exists.
 * For cable machines, values tend to be slightly lower due to
 * constant tension throughout the ROM.
 */
export const VELOCITY_AT_PERCENT_1RM: Record<number, number> = {
  30: 1.28,
  40: 1.13,
  50: 0.96,
  55: 0.88,
  60: 0.79,
  65: 0.71,
  70: 0.62,
  75: 0.54,
  80: 0.46,
  85: 0.37,
  90: 0.29,
  95: 0.21,
  100: 0.17,
};

/**
 * Minimum velocity threshold -- below this, rep is near-maximal.
 * Represents the approximate velocity at which a true 1RM is performed.
 *
 * Individual variation exists; RepOne research emphasizes individual MVT
 * varies by athlete and exercise. This is a conservative default.
 */
export const DEFAULT_MVT = 0.17; // m/s

/**
 * Velocity loss percentage to RIR mapping.
 * Adjusted for cable machines (Rodiles-Guerrero 2020) where
 * velocity loss-to-fatigue ratios are more conservative.
 *
 * This is an InterpolationScheme so consumers can override it
 * with exercise-specific or athlete-specific mappings.
 */
export const DEFAULT_VELOCITY_RIR_MAP: InterpolationScheme = createInterpolationScheme([
  { input: 0, output: 6 },
  { input: 10, output: 5 },
  { input: 20, output: 4 },
  { input: 30, output: 3 },
  { input: 40, output: 2 },
  { input: 50, output: 1 },
  { input: 60, output: 0 },
]);

// =============================================================================
// Utility Functions
// =============================================================================

// Sorted entries for interpolation
const SORTED_ENTRIES = Object.entries(VELOCITY_AT_PERCENT_1RM)
  .map(([pct, vel]) => ({ pct: Number(pct), vel }))
  .sort((a, b) => a.vel - b.vel); // Sort by velocity ascending (high %1RM = low velocity)

/**
 * Estimate %1RM from observed mean concentric velocity.
 *
 * Uses linear interpolation between known data points in the
 * VELOCITY_AT_PERCENT_1RM table. Clamped to [30, 100] range.
 *
 * @param velocity - Mean concentric velocity in m/s
 * @returns Estimated %1RM (30-100)
 */
export function estimatePercent1RMFromVelocity(velocity: number): number {
  // Below MVT -> 100%
  if (velocity <= SORTED_ENTRIES[0].vel) {
    return 100;
  }

  // Above fastest known velocity -> 30%
  if (velocity >= SORTED_ENTRIES[SORTED_ENTRIES.length - 1].vel) {
    return 30;
  }

  // Find bracketing points and interpolate
  for (let i = 0; i < SORTED_ENTRIES.length - 1; i++) {
    const low = SORTED_ENTRIES[i]; // higher %1RM, lower velocity
    const high = SORTED_ENTRIES[i + 1]; // lower %1RM, higher velocity

    if (velocity >= low.vel && velocity <= high.vel) {
      const t = (velocity - low.vel) / (high.vel - low.vel);
      return low.pct + t * (high.pct - low.pct);
    }
  }

  // Should not reach here
  return 50;
}

/**
 * Categorize mean concentric velocity into qualitative zones.
 *
 * Zones are based on general VBT guidelines:
 * - fast:     > 0.75 m/s  (speed/power work, < ~65% 1RM)
 * - moderate: 0.50-0.75 m/s (strength-speed, ~65-80% 1RM)
 * - slow:     0.30-0.50 m/s (strength, ~80-90% 1RM)
 * - grinding:  < 0.30 m/s  (near-maximal, > ~90% 1RM)
 *
 * @param velocity - Mean concentric velocity in m/s
 * @returns Qualitative velocity zone
 */
export function categorizeVelocity(velocity: number): VelocityZone {
  if (velocity > 0.75) return 'fast';
  if (velocity > 0.5) return 'moderate';
  if (velocity > 0.3) return 'slow';
  return 'grinding';
}
