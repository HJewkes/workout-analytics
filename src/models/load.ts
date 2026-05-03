/**
 * Load - resistance/weight configuration and calculation.
 *
 * Two layers:
 * - LoadSettings: captures full configuration (weight, chains, eccentric)
 * - calculateFrameLoad(): per-frame instantaneous load from settings + position + phase
 * - getEffectiveLoad(): simple scalar for existing analytics (returns base weight)
 *
 * The Voltra device doesn't report load in telemetry -- it reports force (user-generated).
 * Load (resistance) is derived from device settings and movement state.
 */
import { MovementPhase } from '@/models/types';

// =============================================================================
// Types
// =============================================================================

/**
 * Load configuration for a set (hardware-agnostic).
 *
 * Maps to Voltra device settings but is not device-specific.
 * Other devices could populate weight only (chains=0, eccentric=0).
 */
export interface LoadSettings {
  /** Base weight in lbs (e.g. 5-200 on Voltra) */
  readonly weight: number;
  /** Chains (reverse resistance) in lbs. Reduces load as position increases. 0 = none. */
  readonly chains: number;
  /** Eccentric load adjustment percentage (-195 to +195). 0 = none. */
  readonly eccentric: number;
}

/**
 * Default load settings (no load configured).
 */
export const DEFAULT_LOAD_SETTINGS: LoadSettings = Object.freeze({
  weight: 0,
  chains: 0,
  eccentric: 0,
});

// =============================================================================
// Per-Frame Load Calculation
// =============================================================================

/**
 * Calculate instantaneous load at a given position and movement phase.
 *
 * This is the "rich" load calculation that accounts for:
 * - Base weight
 * - Chains: reduce load as cable extends (chains lift off ground)
 * - Eccentric adjustment: percentage applied only during eccentric phase
 *
 * Position is normalized 0-1 where 0 = start (cable retracted) and 1 = full extension.
 *
 * Chains curve: At position 0 (cable in), full chains weight is applied.
 * As position increases toward 1, chains progressively lift off, reducing their
 * contribution linearly. This is a simplification -- real chain curves depend on
 * chain length and floor geometry, but linear is a reasonable first approximation.
 *
 * Eccentric adjustment: The eccentric percentage adjusts the base weight during
 * the eccentric phase only. Positive values increase eccentric load (overloading),
 * negative values decrease it (underloading).
 *
 * @param settings - Load configuration
 * @param position - Normalized position (0 = start, 1 = full extension)
 * @param phase - Current movement phase
 * @returns Instantaneous load in lbs
 */
export function calculateFrameLoad(
  settings: LoadSettings,
  position: number,
  phase: MovementPhase
): number {
  let load = settings.weight;

  // Chains: full effect at position 0, decreasing linearly to 0 at position 1
  if (settings.chains > 0) {
    const chainsFactor = Math.max(0, Math.min(1, 1 - position));
    load += settings.chains * chainsFactor;
  }

  // Eccentric adjustment: percentage of base weight, only during eccentric
  if (settings.eccentric !== 0 && phase === MovementPhase.ECCENTRIC) {
    load += settings.weight * (settings.eccentric / 100);
  }

  return Math.max(0, load);
}

// =============================================================================
// Simple Accessor
// =============================================================================

/**
 * Get effective load for simple analytics (returns base weight).
 *
 * This is the "Layer 2" accessor for existing calculations that just need
 * a single load number -- volume, e1RM, stimulus, fatigue. The base weight
 * is the right value for these because:
 * - Volume = weight x reps (standard definition)
 * - Epley e1RM uses the weight you selected
 * - Stimulus scoring compares against e1RM (also weight-based)
 * - Fatigue tracking compares across sets at the same weight setting
 *
 * @param settings - Load configuration
 * @returns Base weight in lbs
 */
export function getEffectiveLoad(settings: LoadSettings): number {
  return settings.weight;
}
