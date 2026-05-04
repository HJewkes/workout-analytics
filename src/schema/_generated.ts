/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate via `npm run migrations:build` (which runs scripts/migrations-build.mjs).
 * CI verifies this file is in sync with the SQL source via `git diff --exit-code`
 * after running the build script (AC-29).
 *
 * The SHA-256 is computed over the raw `001_initial.sql` Buffer (no decoding) so it
 * is stable across platforms (v5R-10 / AC-37). `.gitattributes` enforces `*.sql -text`
 * to prevent git from normalizing line endings on the source.
 */

export const INITIAL_SQL =
  'CREATE TABLE sessions (\n  id TEXT PRIMARY KEY NOT NULL,\n  started_at INTEGER NOT NULL,\n  ended_at INTEGER,\n  exercise_id TEXT,\n  device_id TEXT,\n  notes TEXT,\n  schema_version INTEGER NOT NULL\n);\nCREATE INDEX idx_sessions_started_at ON sessions(started_at);\n\nCREATE TABLE sets (\n  id TEXT PRIMARY KEY NOT NULL,\n  session_id TEXT NOT NULL,\n  set_number INTEGER NOT NULL,\n  load_kg REAL,\n  load_type TEXT,\n  schema_version INTEGER NOT NULL,\n  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE\n);\nCREATE INDEX idx_sets_session_id ON sets(session_id);\n\nCREATE TABLE reps (\n  id TEXT PRIMARY KEY NOT NULL,\n  set_id TEXT NOT NULL,\n  rep_number INTEGER NOT NULL,\n  raw_samples_json TEXT NOT NULL,\n  schema_version INTEGER NOT NULL,\n  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE\n);\nCREATE INDEX idx_reps_set_id ON reps(set_id);\n';

export const INITIAL_SHA256 = '2c4b28649279208405bc6f8b9bb41cdb1587075963d90707c03cc3e7467ca8ab';
