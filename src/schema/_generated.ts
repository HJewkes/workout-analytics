/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate via `npm run migrations:build` (which runs scripts/migrations-build.mjs).
 * CI verifies this file is in sync with the SQL source via `git diff --exit-code`
 * after running the build script (AC-29).
 *
 * Each SHA-256 is computed over the raw `.sql` Buffer (no decoding) so it is stable
 * across platforms (v5R-10 / AC-37). `.gitattributes` enforces `*.sql -text` to
 * prevent git from normalizing line endings on the source.
 */

export const INITIAL_SQL =
  'CREATE TABLE sessions (\n  id TEXT PRIMARY KEY NOT NULL,\n  started_at INTEGER NOT NULL,\n  ended_at INTEGER,\n  exercise_id TEXT,\n  device_id TEXT,\n  notes TEXT,\n  schema_version INTEGER NOT NULL\n);\nCREATE INDEX idx_sessions_started_at ON sessions(started_at);\n\nCREATE TABLE sets (\n  id TEXT PRIMARY KEY NOT NULL,\n  session_id TEXT NOT NULL,\n  set_number INTEGER NOT NULL,\n  load_kg REAL,\n  load_type TEXT,\n  schema_version INTEGER NOT NULL,\n  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE\n);\nCREATE INDEX idx_sets_session_id ON sets(session_id);\n\nCREATE TABLE reps (\n  id TEXT PRIMARY KEY NOT NULL,\n  set_id TEXT NOT NULL,\n  rep_number INTEGER NOT NULL,\n  raw_samples_json TEXT NOT NULL,\n  schema_version INTEGER NOT NULL,\n  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE\n);\nCREATE INDEX idx_reps_set_id ON reps(set_id);\n';

export const INITIAL_SHA256 = '2c4b28649279208405bc6f8b9bb41cdb1587075963d90707c03cc3e7467ca8ab';

export const POSITION_METRES_SQL =
  "-- 002 — position-scale boundary marker (no data change).\n--\n-- WA 2.0.0 redefined `WorkoutSample.position` from a normalised 0–1 fraction to\n-- cable extension in METRES. Sample streams are persisted verbatim inside\n-- `reps.raw_samples_json`, so this store holds positions on both scales.\n--\n-- This migration deliberately rewrites NOTHING. The old scale was\n-- device-dependent and was never recorded alongside the data, so there is no\n-- factor to convert by; inventing one would corrupt the rows it touched while\n-- looking successful. Instead the boundary is recorded:\n--\n--   * Applying this migration raises the store's `latestAppliedVersion` to 2,\n--     so every row written from now on carries `schema_version = 2`. Rows\n--     already in the table keep `schema_version = 1`.\n--   * `schema_version = 1` on a `reps` row therefore means: positions inside\n--     `raw_samples_json` are on an UNSPECIFIED, pre-2.0.0 scale.\n--   * `schema_version >= 2` means: positions are metres.\n--\n-- Consumers must not compare absolute ROM, work or power across that boundary.\n-- Ratio analytics are scale-invariant only WITHIN one row's scale, so a set\n-- spanning both versions cannot be analysed as one set.\n--\n-- `PRAGMA user_version` mirrors the boundary at the SQLite level so a reader\n-- can tell which contract a database file was last written under without\n-- reading `__migrations`.\nPRAGMA user_version = 2;\n";

export const POSITION_METRES_SHA256 =
  '42a9c35ffbcb0cb3401a3c12b7a04e9283d3a39311fe4a0518d9304190574a21';
