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
  /**
   * Chains ("reverse resistance") in lbs. Reduces load as position increases;
   * 0 = none.
   *
   * DIRECTION IS UNRESOLVED — see the note on `calculateFrameLoad`. This term
   * is DESCENDING in extension, which matches the device's *inverse*-chains
   * behaviour rather than its regular-chains behaviour. Do not rely on it to
   * model regular chains until that is settled.
   */
  readonly chains: number;
  /** Eccentric load adjustment percentage (-195 to +195). 0 = none. */
  readonly eccentric: number;
  /**
   * Cable extension at which the chain term reaches zero, in the SAME units as
   * `WorkoutSample.position` (metres, as of 2.0.0). The chain ramp is
   * `1 − position / chainsFullExtension`, clamped to [0, 1].
   *
   * REQUIRED as of 2.0.0, and required precisely because there is no safe
   * default. A default of `1` would NOT have preserved the behaviour real
   * callers were getting: producers fed device-native positions (~600 at full
   * pull), so `clamp(1 − 600)` was `0` and the chain term never engaged at all.
   * Defaulting to `1` under the metres contract would silently switch those
   * callers from "no chain contribution" to a plausible-looking curve — with
   * base 100 lb and chains 50 lb on a 0.6 m cable, +20 lb of phantom load at
   * full extension and mean chain contribution overstated by 40% across the
   * stroke. A default here changes behaviour rather than preserving it, which
   * is the opposite of what a default is for.
   *
   * Ignored when `chains === 0`, so a chainless caller is unaffected at
   * runtime. A reference of `0` (or negative) drops the chain term entirely
   * rather than guessing a ramp.
   */
  readonly chainsFullExtension: number;
}

/**
 * Default load settings (no load configured).
 *
 * `chainsFullExtension` is `0` because there are no chains to ramp and no
 * cable geometry to assume. A caller adding chains by spreading this default
 * (`{ ...DEFAULT_LOAD_SETTINGS, chains: 40 }`) gets NO chain contribution at
 * all — loudly wrong, and so noticed — rather than a plausible-looking ramp
 * against a fabricated reference. Set `chainsFullExtension` alongside `chains`.
 */
export const DEFAULT_LOAD_SETTINGS: LoadSettings = Object.freeze({
  weight: 0,
  chains: 0,
  eccentric: 0,
  chainsFullExtension: 0,
});

// =============================================================================
// Per-Frame Load Calculation
// =============================================================================

/**
 * Calculate instantaneous load at a given position and movement phase.
 *
 * This is the "rich" load calculation that accounts for:
 * - Base weight
 * - Chains: a term that DECREASES as the cable extends (see the direction
 *   caveat below)
 * - Eccentric adjustment: percentage applied only during eccentric phase
 *
 * Position is cable extension in metres (see `WorkoutSample.position`), 0 =
 * start (cable retracted). This function is the ONLY place in the library that
 * needs an absolute position scale, which is why it takes the full-extension
 * reference explicitly rather than assuming a 0-1 range.
 *
 * Chains curve: full chains weight at position 0, decreasing linearly to zero
 * at `settings.chainsFullExtension`. Linear is a simplification of any real
 * chain geometry.
 *
 * DIRECTION CAVEAT — READ BEFORE RELYING ON THIS TERM.
 * This ramp is DESCENDING in extension. That is the opposite of physical
 * barbell chains, where links leaving the floor transfer their weight onto the
 * bar and resistance RISES through the concentric. It is also, per the device
 * SDK, the opposite of what this device calls regular chains: `voltra-node-sdk`
 * `src/sdk/voltra-client.ts:693-700` documents `setInverseChains` as "reduce
 * resistance during the concentric (lifting) phase and add resistance during
 * the eccentric (lowering) phase - opposite of regular chains". Since
 * `position` grows through the concentric, a term that falls with position is
 * modelling the device's INVERSE-chains behaviour under the name `chains`.
 *
 * The formula is deliberately left as-is: changing its direction moves every
 * chains-set load and belongs in its own change with its own review. Until
 * then, treat `chains` as unvalidated for regular-chain modelling. `eccentric`
 * below is NOT affected — it is phase-gated and behaves as documented. Tracked
 * in `KNOWN-ISSUES-2026-07-27.md`.
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
    const fullExtension = settings.chainsFullExtension;
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
