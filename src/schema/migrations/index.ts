/**
 * Migration registry.
 *
 * The migration runner consumes `MIGRATIONS` and applies any unapplied versions in
 * order, verifying the persisted SHA-256 hashes against the values declared here
 * (FIX-2). The hashes come from the populated, committed `_generated.ts` file.
 */

import {
  INITIAL_SHA256,
  INITIAL_SQL,
  POSITION_METRES_SHA256,
  POSITION_METRES_SQL,
} from '../_generated.js';

export interface Migration {
  readonly version: number;
  readonly sql: string;
  readonly sha256: string;
}

/**
 * Version 2 is a boundary MARKER, not a data change (see
 * `002_position_metres.sql`). WA 2.0.0 redefined `WorkoutSample.position` as
 * metres, and sample streams are persisted verbatim inside
 * `reps.raw_samples_json` — but the old scale was device-dependent and was
 * never recorded alongside the data, so there is no factor to convert by.
 * Applying v2 raises the store's `latestAppliedVersion` to 2, stamping every
 * subsequently written row with `schema_version = 2`; rows left at 1 hold
 * positions on the unspecified pre-2.0.0 scale. Mark the boundary; never
 * rewrite history to a scale you are inferring.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: INITIAL_SQL, sha256: INITIAL_SHA256 },
  { version: 2, sql: POSITION_METRES_SQL, sha256: POSITION_METRES_SHA256 },
] as const;
