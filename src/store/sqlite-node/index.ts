/**
 * `createSqliteNodeStore` — Node driver factory for the `SessionStore`
 * interface, backed by `better-sqlite3`.
 *
 * Lifecycle (matches the design's "Open path" sequence):
 *   1. Resolve the `better-sqlite3` peer (default: `createRequire`).
 *   2. Open the database file. Native errors are wrapped as
 *      `StoreError('failed to open database: <reason>')` with `cause` (D15 /
 *      AC-21).
 *   3. Build a `BetterSqlite3Driver` over the connection.
 *   4. `applyConnectionPragmas(driver)` (D8 / v5R-9 / AC-08 / AC-36).
 *   5. `runner.run(MIGRATIONS)` (D5 / D12 / v5R-6).
 *   6. Compute `latestAppliedVersion = max(getAppliedVersions())` (D-VER /
 *      AC-30 / AC-31).
 *   7. Return a `SessionStore` impl that closes over the driver + version.
 *
 * Concurrency (v5R-1 / AC-32): every write goes through `withTransaction`,
 * which calls into `BetterSqlite3Driver.transaction`. See driver.ts for the
 * deviation from v5R-1 — better-sqlite3's `db.transaction(fn)` rejects async
 * `fn`, so we issue BEGIN/COMMIT manually and serialize callers with the
 * driver's promise-mutex. The DB ops themselves remain synchronous.
 *
 * `saveReps([])` short-circuits before opening any transaction (v5R-3).
 *
 * `close()` is idempotent (v5R-8 / AC-35); subsequent calls are no-ops. After
 * close, every other method rejects with `StoreError('store is closed')`.
 */

import { MIGRATIONS } from '../../schema/migrations/index.js';
import { repRecordSchema, setRecordSchema, sessionSchema } from '../../schema/validators.js';
import type { RepRecord, SetRecord, Session } from '../../schema/types.js';
import { applyConnectionPragmas } from '../bootstrap.js';
import { StoreError, ValidationError } from '../errors.js';
import { MigrationRunner } from '../migration-runner.js';
import { prepareForSave } from '../prepare-for-save.js';
import type { SessionStore } from '../session-store.js';
import { withTransaction } from '../with-transaction.js';
import { BetterSqlite3Driver, type BetterSqlite3Database } from './driver.js';
import { createRequirePeerResolver, type PeerResolver } from './require-peer.js';

export interface CreateSqliteNodeStoreOptions {
  /** Filesystem path to the SQLite database file. */
  path: string;
  /**
   * Optional resolver for the `better-sqlite3` peer (AC-23 / v3-FIX-1).
   * Defaults to a `createRequire(import.meta.url)`-backed resolver (AC-22).
   */
  resolver?: PeerResolver;
}

interface BetterSqlite3Constructor {
  new (path: string): BetterSqlite3Database;
}

interface SessionRow {
  id: string;
  started_at: number;
  ended_at: number | null;
  exercise_id: string | null;
  device_id: string | null;
  notes: string | null;
  schema_version: number;
}

interface SetRow {
  id: string;
  session_id: string;
  set_number: number;
  load_kg: number | null;
  load_type: string | null;
  schema_version: number;
}

interface RepRow {
  id: string;
  set_id: string;
  rep_number: number;
  raw_samples_json: string;
  schema_version: number;
}

function rowToSession(row: SessionRow): Session {
  const out: Session = {
    id: row.id,
    startedAt: row.started_at,
    schemaVersion: row.schema_version,
  };
  if (row.ended_at !== null) out.endedAt = row.ended_at;
  if (row.exercise_id !== null) out.exerciseId = row.exercise_id;
  if (row.device_id !== null) out.deviceId = row.device_id;
  if (row.notes !== null) out.notes = row.notes;
  return out;
}

function rowToSet(row: SetRow): SetRecord {
  const out: SetRecord = {
    id: row.id,
    sessionId: row.session_id,
    setNumber: row.set_number,
    schemaVersion: row.schema_version,
  };
  if (row.load_kg !== null) out.loadKg = row.load_kg;
  if (row.load_type !== null) out.loadType = row.load_type as 'absolute' | 'percent1RM';
  return out;
}

function rowToRep(row: RepRow): RepRecord {
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
  // better-sqlite3 surfaces these as "SQLITE_CONSTRAINT_PRIMARYKEY" or
  // "SQLITE_CONSTRAINT_UNIQUE" on the `code` property and includes the term
  // in the message. We match defensively on either signal.
  const code = (err as { code?: string }).code;
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) return true;
  return /UNIQUE constraint failed|PRIMARY KEY/i.test(err.message);
}

function probeRawSamples(reps: readonly RepRecord[], setId: string): void {
  for (const rep of reps) {
    try {
      JSON.parse(rep.rawSamplesJson);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ValidationError(
        `corrupt rawSamples for set ${setId}, rep ${rep.repNumber}: ${reason}`,
        { cause: err }
      );
    }
  }
}

export async function createSqliteNodeStore(
  options: CreateSqliteNodeStoreOptions
): Promise<SessionStore> {
  const resolver = options.resolver ?? createRequirePeerResolver();
  const Database = resolver('better-sqlite3') as BetterSqlite3Constructor;

  let db: BetterSqlite3Database;
  try {
    db = new Database(options.path);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new StoreError(`failed to open database: ${reason}`, { cause: err });
  }

  const driver = new BetterSqlite3Driver(db);
  await applyConnectionPragmas(driver);

  const runner = new MigrationRunner(driver);
  await runner.run(MIGRATIONS);

  const applied = await runner.getAppliedVersions();
  const latestAppliedVersion = Math.max(...applied);

  let closed = false;

  function guard(): void {
    if (closed) throw new StoreError('store is closed');
  }

  async function saveSession(session: Session): Promise<void> {
    guard();
    const prepared = prepareForSave(sessionSchema, session, latestAppliedVersion);
    await withTransaction(driver, () => {
      try {
        db.prepare(
          'INSERT INTO sessions (id, started_at, ended_at, exercise_id, device_id, notes, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          prepared.id,
          prepared.startedAt,
          prepared.endedAt ?? null,
          prepared.exerciseId ?? null,
          prepared.deviceId ?? null,
          prepared.notes ?? null,
          prepared.schemaVersion
        );
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new StoreError(`duplicate id: ${prepared.id}`, { cause: err });
        }
        throw err;
      }
    });
  }

  async function saveSet(set: SetRecord): Promise<void> {
    guard();
    const prepared = prepareForSave(setRecordSchema, set, latestAppliedVersion);
    await withTransaction(driver, () => {
      try {
        db.prepare(
          'INSERT INTO sets (id, session_id, set_number, load_kg, load_type, schema_version) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          prepared.id,
          prepared.sessionId,
          prepared.setNumber,
          prepared.loadKg ?? null,
          prepared.loadType ?? null,
          prepared.schemaVersion
        );
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          throw new StoreError(`duplicate id: ${prepared.id}`, { cause: err });
        }
        throw err;
      }
    });
  }

  async function saveReps(reps: readonly RepRecord[]): Promise<void> {
    guard();
    // v5R-3 / EC-14: empty input is a no-op — return BEFORE opening any
    // transaction. Tests assert no BEGIN is issued.
    if (reps.length === 0) return;

    const prepared = reps.map((r) => prepareForSave(repRecordSchema, r, latestAppliedVersion));

    await withTransaction(driver, () => {
      const stmt = db.prepare(
        'INSERT INTO reps (id, set_id, rep_number, raw_samples_json, schema_version) VALUES (?, ?, ?, ?, ?)'
      );
      for (const rep of prepared) {
        try {
          stmt.run(rep.id, rep.setId, rep.repNumber, rep.rawSamplesJson, rep.schemaVersion);
        } catch (err) {
          if (isUniqueConstraintError(err)) {
            throw new StoreError(`duplicate id: ${rep.id}`, { cause: err });
          }
          throw err;
        }
      }
    });
  }

  async function getSession(id: string): Promise<Session | undefined> {
    guard();
    const rows = (await driver.selectAll('SELECT * FROM sessions WHERE id = ?', [
      id,
    ])) as SessionRow[];
    return rows[0] ? rowToSession(rows[0]) : undefined;
  }

  async function getSetsBySession(sessionId: string): Promise<SetRecord[]> {
    guard();
    const rows = (await driver.selectAll(
      'SELECT * FROM sets WHERE session_id = ? ORDER BY set_number ASC',
      [sessionId]
    )) as SetRow[];
    return rows.map(rowToSet);
  }

  async function getRepsBySet(setId: string): Promise<RepRecord[]> {
    guard();
    const rows = (await driver.selectAll(
      'SELECT * FROM reps WHERE set_id = ? ORDER BY rep_number ASC',
      [setId]
    )) as RepRow[];
    const reps = rows.map(rowToRep);
    probeRawSamples(reps, setId);
    return reps;
  }

  async function getRecent(limit: number): Promise<Session[]> {
    guard();
    if (!Number.isInteger(limit) || limit < 0) {
      throw new StoreError(`invalid limit: ${String(limit)}`);
    }
    const rows = (await driver.selectAll(
      'SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?',
      [limit]
    )) as SessionRow[];
    return rows.map(rowToSession);
  }

  async function close(): Promise<void> {
    if (closed) return; // v5R-8 / AC-35 idempotent.
    closed = true;
    db.close();
  }

  return {
    saveSession,
    saveSet,
    saveReps,
    getSession,
    getSetsBySession,
    getRepsBySet,
    getRecent,
    close,
  };
}
