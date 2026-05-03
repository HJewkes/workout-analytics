CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  exercise_id TEXT,
  device_id TEXT,
  notes TEXT,
  schema_version INTEGER NOT NULL
);
CREATE INDEX idx_sessions_started_at ON sessions(started_at);

CREATE TABLE sets (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  load_kg REAL,
  load_type TEXT,
  schema_version INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_sets_session_id ON sets(session_id);

CREATE TABLE reps (
  id TEXT PRIMARY KEY NOT NULL,
  set_id TEXT NOT NULL,
  rep_number INTEGER NOT NULL,
  raw_samples_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);
CREATE INDEX idx_reps_set_id ON reps(set_id);
