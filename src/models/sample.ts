/**
 * WorkoutSample - a single data point during exercise.
 *
 * Hardware-agnostic representation of one measurement.
 * Adapters convert device-specific data into this format.
 * All values are normalized/standardized.
 */
import { type MovementPhase } from './types';

export interface WorkoutSample {
  /** Incrementing sequence number from source device (for drop detection) */
  sequence: number;

  /** Timestamp in ms since epoch */
  timestamp: number;

  /** Current movement phase */
  phase: MovementPhase;

  /**
   * Cable extension in **metres (m)** — an absolute displacement from the
   * device's zero/rest position, NOT a normalised 0–1 fraction.
   *
   * BREAKING in 2.0.0: this field was previously documented as normalised
   * (`0 = start, 1 = full extension`). In practice producers forwarded a
   * device-native extension figure (≈0 at rest, ~600 at full pull) unconverted,
   * so a consumer computing ROM from `samples` and one reading a metres-valued
   * `rom_m` disagreed about the same rep. The contract is now metres, converted
   * at the producer's bridge; this library performs NO conversion and must not
   * be handed device-native units.
   *
   * Consequences:
   * - Displacement-derived outputs are now metres or metre-derived:
   *   `getPhaseRangeOfMotion`, `getRepRangeOfMotion`, `getRepWork` /
   *   `getRepTotalWork` (lbs·m), `getRepMeanConcentricPower` (lbs·m/s).
   * - Ratio-based analytics are scale-invariant and unchanged in value —
   *   percent ROM decay within a set, CV, curve shape, `getRepROMRatio`,
   *   `isPartialRep`, the fatigue ROM/velocity dimensions — provided any
   *   caller-supplied expected/reference ROM is in the SAME units.
   * - `calculateFrameLoad`'s chain ramp is the one place that assumed a 0–1
   *   range. It is now parameterised by `LoadSettings.chainsFullExtension`,
   *   which callers on metres MUST set. See `models/load.ts`.
   *
   * Always non-negative.
   */
  position: number;

  /**
   * Instantaneous velocity magnitude in m/s.
   *
   * MUST be non-negative. Direction of motion is encoded by `phase`
   * (CONCENTRIC vs ECCENTRIC), not by velocity sign. Adapters converting
   * signed device velocity (e.g. SDK 0.6.0+ where eccentric velocity is
   * reported as negative) MUST apply `Math.abs` at the boundary.
   *
   * Phase aggregation defensively normalizes via `Math.abs` so a buggy
   * adapter does not silently zero peak velocity, but consumers should
   * treat this field as magnitude-only.
   */
  velocity: number;

  /**
   * Force reading in pounds (lbs).
   *
   * MUST be in lbs, NOT tenths-of-lbs. Adapters reading device frames
   * that report force as uint16 tenths-of-lbs (e.g. SDK 0.6.0+) MUST
   * divide by 10 before populating this field. Passing inflated (10x)
   * values silently scales `getRepWork` / `getRepImpulse` /
   * `getRepMeanConcentricPower` by 10x with no runtime error.
   *
   * Always non-negative.
   */
  force: number;

  /** Instantaneous load/resistance (lbs). Calculated from device settings + position + phase.
   *  Optional for backward compatibility -- not available for samples created without settings. */
  load?: number;
}
