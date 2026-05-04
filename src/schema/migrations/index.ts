/**
 * Migration registry.
 *
 * The migration runner consumes `MIGRATIONS` and applies any unapplied versions in
 * order, verifying the persisted SHA-256 hashes against the values declared here
 * (FIX-2). The hashes come from the populated, committed `_generated.ts` file.
 */

import { INITIAL_SHA256, INITIAL_SQL } from '../_generated.js';

export interface Migration {
  readonly version: number;
  readonly sql: string;
  readonly sha256: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: INITIAL_SQL, sha256: INITIAL_SHA256 },
] as const;
