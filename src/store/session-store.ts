/**
 * `SessionStore` — the public storage interface, implemented by the Node and
 * Expo drivers.
 *
 * Read methods resolve to `undefined`/`[]` for missing rows. There is no
 * `NotFoundError` (D16 / AC-15). There is no `readOnly` option (AC-16).
 *
 * All write methods serialize through the driver-specific transaction shim
 * (`withTransaction`), so callers can issue concurrent writes without
 * worrying about BEGIN-BEGIN races (v5R-1 / AC-32 / AC-CONCURRENCY).
 *
 * Round-trip (D11 / AC-06): the records returned by reads are deeply equal to
 * the values passed in on save, modulo `schemaVersion` which the store
 * overwrites with `latestAppliedVersion` (D2 / AC-05).
 */

import type { RepRecord, SetRecord, Session } from '../schema/types.js';

export interface SessionStore {
  // ---------------------------------------------------------------- writes

  /**
   * Persist a session. Throws `StoreError('duplicate id: <id>')` if the id
   * already exists (v5R-2 / AC-DUP). Always validated and shallow-copied
   * via `prepareForSave`; `schemaVersion` is overwritten with the store's
   * `latestAppliedVersion` (D2 / AC-05). Atomic — implemented inside
   * `withTransaction` (AC-14).
   */
  saveSession(session: Session): Promise<void>;

  /**
   * Persist a set. Throws `StoreError('duplicate id: <id>')` on PK conflict
   * (v5R-2). The set's `sessionId` is FK-validated by the schema's CASCADE
   * relationship — caller's responsibility to insert the parent session
   * first. Atomic.
   */
  saveSet(set: SetRecord): Promise<void>;

  /**
   * Bulk-persist reps for a single set in one transaction (atomic).
   *
   * - **Empty input is a no-op** (v5R-3 / EC-EMPTY-REPS): returns immediately
   *   without opening a transaction or issuing any SQL.
   * - **Duplicate id**: throws `StoreError('duplicate id: <id>')` and rolls
   *   back the entire batch — partial writes are not visible (AC-14 +
   *   v5R-2).
   * - **Validation**: each rep is validated and shallow-copied via
   *   `prepareForSave` before insert. A `ZodError` becomes
   *   `ValidationError(<msg>, { cause })`.
   */
  saveReps(reps: readonly RepRecord[]): Promise<void>;

  // ---------------------------------------------------------------- reads

  /**
   * Read a session by id. Resolves to `undefined` if not found
   * (D16 / AC-15 — no NotFoundError).
   */
  getSession(id: string): Promise<Session | undefined>;

  /**
   * Read all sets for a session, ordered ascending by `set_number`
   * (v5R-11 / AC-ORDER). Empty array if the session has no sets or doesn't
   * exist.
   */
  getSetsBySession(sessionId: string): Promise<SetRecord[]>;

  /**
   * Read all reps for a set, ordered ascending by `rep_number`
   * (v5R-11 / AC-ORDER). Empty array if the set has no reps or doesn't
   * exist.
   *
   * On read, each rep's `rawSamplesJson` is JSON-parse-probed for
   * corruption — failure throws `ValidationError('corrupt rawSamples for
   * set <setId>, rep <n>: <msg>')` (v5R-4 / FIX-5). The parsed value is
   * discarded; the runtime field stays a string.
   */
  getRepsBySet(setId: string): Promise<RepRecord[]>;

  /**
   * Recent sessions, newest-first (descending by `started_at`), capped at
   * `limit`.
   *
   * - `limit` MUST be a non-negative integer. Otherwise throws
   *   `StoreError('invalid limit: <value>')` (v5R-7 / AC-LIMIT-VALIDATION).
   * - `getRecent(0)` is allowed and returns `[]`.
   */
  getRecent(limit: number): Promise<Session[]>;

  // ---------------------------------------------------------------- lifecycle

  /**
   * Close the underlying driver / connection.
   *
   * - **Idempotent**: subsequent calls are no-ops that resolve immediately
   *   (v5R-8 / AC-CLOSE-IDEMPOTENT / AC-35).
   * - After `close()`, every other method rejects with
   *   `StoreError('store is closed')`.
   */
  close(): Promise<void>;
}
