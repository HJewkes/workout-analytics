/**
 * `createSqliteExpoStore({ path })` — open an Expo / React Native SQLite
 * database, apply connection PRAGMAs, run migrations, and return a
 * `SessionStore` backed by `expo-sqlite`.
 *
 * Open path (mirrors the Node factory in PR1):
 *
 *   1. `openDatabaseAsync(path)` — wrap native errors as
 *      `StoreError('failed to open database: <reason>', { cause })` (D15).
 *   2. Build `ExpoSqliteDriver(db)`.
 *   3. `applyConnectionPragmas(driver)` (D8 / v5R-9 / AC-08 / AC-WAL-READBACK).
 *   4. `runner.run(MIGRATIONS)` (D5 / D12 / v5R-6).
 *   5. `latestAppliedVersion = Math.max(...await runner.getAppliedVersions())`
 *      (D-VER / v4-FIX-1).
 *   6. Return a `SessionStore` impl that closes over the driver + version.
 *
 * Verification (NF-04 / v5R-16): the Expo driver runs only on Expo SDK 54+
 * targets — `expo-sqlite` is a React Native native module and cannot import
 * in plain Node. The package's CI typechecks the driver (resolving
 * `expo-sqlite/package.json#exports`); functional verification is owned by
 * `voltras/mobile`'s integration tests. See README "Verification".
 */

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { MIGRATIONS } from '../../schema/migrations/index.js';
import { repRecordSchema, setRecordSchema, sessionSchema } from '../../schema/validators.js';
import type { RepRecord, SetRecord, Session } from '../../schema/types.js';
import { applyConnectionPragmas } from '../bootstrap.js';
import { StoreError, ValidationError } from '../errors.js';
import { MigrationRunner } from '../migration-runner.js';
import { prepareForSave } from '../prepare-for-save.js';
import type { SessionStore } from '../session-store.js';
import { withTransaction } from '../with-transaction.js';
import { ExpoSqliteDriver } from './driver.js';

export interface CreateSqliteExpoStoreOptions {
  /** Database file name / path passed through to `openDatabaseAsync`. */
  readonly path: string;
}

interface SessionRow {
  readonly id: string;
  readonly started_at: number;
  readonly ended_at: number | null;
  readonly exercise_id: string | null;
  readonly device_id: string | null;
  readonly notes: string | null;
  readonly schema_version: number;
}

interface SetRow {
  readonly id: string;
  readonly session_id: string;
  readonly set_number: number;
  readonly load_kg: number | null;
  readonly load_type: string | null;
  readonly schema_version: number;
}

interface RepRow {
  readonly id: string;
  readonly set_id: string;
  readonly rep_number: number;
  readonly raw_samples_json: string;
  readonly schema_version: number;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
    ...(row.exercise_id !== null ? { exerciseId: row.exercise_id } : {}),
    ...(row.device_id !== null ? { deviceId: row.device_id } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    schemaVersion: row.schema_version,
  };
}

function rowToSet(row: SetRow): SetRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    setNumber: row.set_number,
    ...(row.load_kg !== null ? { loadKg: row.load_kg } : {}),
    ...(row.load_type !== null ? { loadType: row.load_type as 'absolute' | 'percent1RM' } : {}),
    schemaVersion: row.schema_version,
  };
}

function rowToRep(row: RepRow): RepRecord {
  // v5R-4 / FIX-5: probe JSON-parseability and discard the parsed value.
  // The runtime field stays the raw string.
  try {
    JSON.parse(row.raw_samples_json);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid JSON';
    throw new ValidationError(
      `corrupt rawSamples for set ${row.set_id}, rep ${row.rep_number}: ${message}`,
      { cause: err }
    );
  }
  return {
    id: row.id,
    setId: row.set_id,
    repNumber: row.rep_number,
    rawSamplesJson: row.raw_samples_json,
    schemaVersion: row.schema_version,
  };
}

function isUniqueConstraintError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes('UNIQUE constraint failed') ||
    msg.includes('PRIMARY KEY must be unique') ||
    msg.includes('SQLITE_CONSTRAINT')
  );
}

export async function createSqliteExpoStore(
  options: CreateSqliteExpoStoreOptions
): Promise<SessionStore> {
  let db: SQLiteDatabase;
  try {
    db = await openDatabaseAsync(options.path);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    throw new StoreError(`failed to open database: ${message}`, { cause: err });
  }

  const driver = new ExpoSqliteDriver(db);
  await applyConnectionPragmas(driver);

  const runner = new MigrationRunner(driver);
  await runner.run(MIGRATIONS);
  const appliedVersions = await runner.getAppliedVersions();
  const latestAppliedVersion = Math.max(...appliedVersions);

  let closed = false;
  const guard = (): void => {
    if (closed) throw new StoreError('store is closed');
  };

  const store: SessionStore = {
    async saveSession(session) {
      guard();
      const prepared = prepareForSave(sessionSchema, session, latestAppliedVersion);
      try {
        await withTransaction(driver, async () => {
          await driver.run(
            'INSERT INTO sessions (id, started_at, ended_at, exercise_id, device_id, notes, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              prepared.id,
              prepared.startedAt,
              prepared.endedAt,
              prepared.exerciseId,
              prepared.deviceId,
              prepared.notes,
              prepared.schemaVersion,
            ]
          );
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new StoreError(`duplicate id: ${prepared.id}`, { cause: err });
        }
        throw err;
      }
    },

    async saveSet(set) {
      guard();
      const prepared = prepareForSave(setRecordSchema, set, latestAppliedVersion);
      try {
        await withTransaction(driver, async () => {
          await driver.run(
            'INSERT INTO sets (id, session_id, set_number, load_kg, load_type, schema_version) VALUES (?, ?, ?, ?, ?, ?)',
            [
              prepared.id,
              prepared.sessionId,
              prepared.setNumber,
              prepared.loadKg,
              prepared.loadType,
              prepared.schemaVersion,
            ]
          );
        });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new StoreError(`duplicate id: ${prepared.id}`, { cause: err });
        }
        throw err;
      }
    },

    async saveReps(reps) {
      guard();
      // v5R-3 / EC-EMPTY-REPS: empty input is a no-op — no transaction opened.
      if (reps.length === 0) return;

      // Validate-and-prepare all reps up front so a validation failure in the
      // batch doesn't leave a half-opened transaction.
      const prepared = reps.map((r) => prepareForSave(repRecordSchema, r, latestAppliedVersion));

      let conflictId: string | undefined;
      try {
        await withTransaction(driver, async () => {
          for (const rep of prepared) {
            try {
              await driver.run(
                'INSERT INTO reps (id, set_id, rep_number, raw_samples_json, schema_version) VALUES (?, ?, ?, ?, ?)',
                [rep.id, rep.setId, rep.repNumber, rep.rawSamplesJson, rep.schemaVersion]
              );
            } catch (err) {
              if (isUniqueConstraintError(err)) {
                conflictId = rep.id;
              }
              throw err;
            }
          }
        });
      } catch (err) {
        if (conflictId !== undefined) {
          throw new StoreError(`duplicate id: ${conflictId}`, { cause: err });
        }
        throw err;
      }
    },

    async getSession(id) {
      guard();
      const rows = (await driver.selectAll(
        'SELECT id, started_at, ended_at, exercise_id, device_id, notes, schema_version FROM sessions WHERE id = ?',
        [id]
      )) as readonly SessionRow[];
      const row = rows[0];
      return row ? rowToSession(row) : undefined;
    },

    async getSetsBySession(sessionId) {
      guard();
      const rows = (await driver.selectAll(
        'SELECT id, session_id, set_number, load_kg, load_type, schema_version FROM sets WHERE session_id = ? ORDER BY set_number ASC',
        [sessionId]
      )) as readonly SetRow[];
      return rows.map(rowToSet);
    },

    async getRepsBySet(setId) {
      guard();
      const rows = (await driver.selectAll(
        'SELECT id, set_id, rep_number, raw_samples_json, schema_version FROM reps WHERE set_id = ? ORDER BY rep_number ASC',
        [setId]
      )) as readonly RepRow[];
      return rows.map(rowToRep);
    },

    async getRecent(limit) {
      guard();
      if (!Number.isInteger(limit) || limit < 0) {
        throw new StoreError(`invalid limit: ${String(limit)}`);
      }
      const rows = (await driver.selectAll(
        'SELECT id, started_at, ended_at, exercise_id, device_id, notes, schema_version FROM sessions ORDER BY started_at DESC LIMIT ?',
        [limit]
      )) as readonly SessionRow[];
      return rows.map(rowToSession);
    },

    async close() {
      // v5R-8 / AC-CLOSE-IDEMPOTENT: idempotent — second call resolves
      // immediately.
      if (closed) return;
      closed = true;
      await db.closeAsync();
    },
  };

  return store;
}
