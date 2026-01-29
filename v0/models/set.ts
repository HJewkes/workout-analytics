/**
 * Set - a collection of reps at one weight.
 *
 * Hardware-agnostic representation of one set.
 * Uses src Rep model for rep data.
 *
 * NOTE: SetMetrics is no longer stored on Set - compute on demand via analytics.
 */
import type { Rep } from '@/models/rep';

export interface Set {
  id: string;
  exerciseId: string;
  exerciseName?: string;

  // Configuration
  weight: number;
  chains?: number;
  eccentricOffset?: number;
  targetTempo?: TempoTarget;

  // Building blocks - uses src Rep model
  reps: Rep[];

  // Timing
  timestamp: { start: number; end: number | null };
}

export interface TempoTarget {
  concentric: number; // seconds
  eccentric: number; // seconds
  pauseTop: number; // seconds
  pauseBottom: number; // seconds
}
