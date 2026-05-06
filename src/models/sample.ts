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

  /** Position in range of motion (0 = start, 1 = full extension) */
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

  /** Force reading (lbs, absolute value) */
  force: number;

  /** Instantaneous load/resistance (lbs). Calculated from device settings + position + phase.
   *  Optional for backward compatibility -- not available for samples created without settings. */
  load?: number;
}
