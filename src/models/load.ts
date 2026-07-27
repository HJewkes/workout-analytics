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
  /**
   * Cable extension at which the chains have fully lifted off, in the SAME
   * units as `WorkoutSample.position` (metres, as of 2.0.0). The chain ramp is
   * `1 − position / chainsFullExtension`, clamped to [0, 1].
   *
   * Defaults to `1`, which reproduces the pre-2.0.0 ramp exactly for callers
   * that were feeding normalised 0–1 positions. Callers now feeding metres
   * MUST set this to the cable's real full-extension distance (~0.6 m on
   * Voltra) — leaving it at 1 makes the chains fall off over a metre of travel
   * and so never fully lift within a real rep. Ignored when `chains === 0`.
   */
  readonly chainsFullExtension?: number;
}

/**
 * Chain ramp reference used when `LoadSettings.chainsFullExtension` is unset.
 * `1` preserves the historical normalised-position behaviour.
 */
export const DEFAULT_CHAINS_FULL_EXTENSION = 1;

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
 * Position is cable extension in metres (see `WorkoutSample.position`), 0 =
 * start (cable retracted). This function is the ONLY place in the library that
 * needs an absolute position scale, which is why it takes the full-extension
 * reference explicitly rather than assuming a 0-1 range.
 *
 * Chains curve: At position 0 (cable in), full chains weight is applied.
 * As position approaches `settings.chainsFullExtension` (default 1), chains
 * progressively lift off, reducing their contribution linearly to zero. This is
 * a simplification -- real chain curves depend on chain length and floor
 * geometry, but linear is a reasonable first approximation.
 *
 * Eccentric adjustment: The eccentric percentage adjusts the base weight during
 * the eccentric phase only. Positive values increase eccentric load (overloading),
 * negative values decrease it (underloading).
 *
 * @param settings - Load configuration
 * @param position - Cable extension in metres (0 = start / cable retracted)
 * @param phase - Current movement phase
 * @returns Instantaneous load in lbs
 */
export function calculateFrameLoad(
  settings: LoadSettings,
  position: number,
  phase: MovementPhase
): number {
  let load = settings.weight;

  // Chains: full effect at position 0, decreasing linearly to 0 at full extension
  if (settings.chains > 0) {
    const fullExtension = settings.chainsFullExtension ?? DEFAULT_CHAINS_FULL_EXTENSION;
    const chainsFactor =
      fullExtension > 0 ? Math.max(0, Math.min(1, 1 - position / fullExtension)) : 0;
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
