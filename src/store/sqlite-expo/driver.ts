/**
 * `ExpoSqliteDriver` — adapter wrapping an `expo-sqlite` `SQLiteDatabase` to
 * satisfy:
 *
 *   - `MigrationDriverSql` (`exec` / `selectAll` / `run`) for the migration
 *     runner and `applyConnectionPragmas`,
 *   - `AsyncTransactionalDriver` (`beginExclusive` / `commit` / `rollback`)
 *     for `withTransaction`.
 *
 * Concurrency (v5R-1 / AC-32 / AC-CONCURRENCY): unlike `better-sqlite3`'s
 * synchronous `db.transaction(fn)` (which SQLite serializes natively), the
 * Expo path is async-throughout — two awaiters could race a BEGIN. The driver
 * holds an internal Promise mutex (`currentTx`) that callers chain onto so
 * `beginExclusive` resolves only after any in-flight transaction has issued
 * its `COMMIT`/`ROLLBACK`.
 *
 * Notes:
 *   - `expo-sqlite`'s `SQLiteBindValue` does not include `undefined`. Optional
 *     record fields (e.g. `endedAt`, `loadKg`) arrive as `undefined` from the
 *     callers, so the runner / store binds via `normalizeParams` which maps
 *     `undefined` → `null`.
 *   - `selectAll` casts through `unknown[]` because `expo-sqlite`'s
 *     `getAllAsync<T>` is generic but the migration runner's
 *     `MigrationDriverSql` interface deliberately stays type-erased.
 */

import type { SQLiteBindParams, SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';
import type { MigrationDriverSql } from '../migration-runner.js';
import type { AsyncTransactionalDriver } from '../with-transaction.js';

function normalizeParams(params: readonly unknown[] | undefined): SQLiteBindParams {
  if (!params || params.length === 0) return [];
  return params.map((p) => (p === undefined ? null : (p as SQLiteBindValue)));
}

export class ExpoSqliteDriver implements MigrationDriverSql, AsyncTransactionalDriver {
  private currentTx: Promise<void> = Promise.resolve();
  private inTx = false;
  private releaseLock: (() => void) | undefined;

  constructor(private readonly db: SQLiteDatabase) {}

  // -------------------------------------------------------------- MigrationDriverSql

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async selectAll(sql: string, params?: readonly unknown[]): Promise<unknown[]> {
    const rows = await this.db.getAllAsync<unknown>(sql, normalizeParams(params));
    return rows;
  }

  async run(sql: string, params?: readonly unknown[]): Promise<void> {
    await this.db.runAsync(sql, normalizeParams(params));
  }

  // -------------------------------------------------------------- AsyncTransactionalDriver

  /**
   * Acquire the transaction lock and issue `BEGIN EXCLUSIVE`.
   *
   * `currentTx` is the tail of the wait-chain. New callers chain after it, so
   * concurrent invocations serialize: the second caller's `BEGIN EXCLUSIVE`
   * runs only after the first caller's `commit()` (or `rollback()`) resolves.
   */
  async beginExclusive(): Promise<void> {
    const previous = this.currentTx;
    let release!: () => void;
    this.currentTx = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      await this.db.execAsync('BEGIN EXCLUSIVE');
    } catch (err) {
      // BEGIN failed — release the lock so the next caller isn't stuck.
      release();
      throw err;
    }
    this.inTx = true;
    this.releaseLock = release;
  }

  async commit(): Promise<void> {
    if (!this.inTx) {
      throw new Error('commit() called outside of a transaction');
    }
    try {
      await this.db.execAsync('COMMIT');
    } finally {
      this.inTx = false;
      this.releaseLock?.();
      this.releaseLock = undefined;
    }
  }

  async rollback(): Promise<void> {
    if (!this.inTx) {
      // No-op: rollback called without an active transaction (e.g. BEGIN
      // itself threw before `inTx` was set). withTransaction's catch path
      // tolerates this.
      return;
    }
    try {
      await this.db.execAsync('ROLLBACK');
    } finally {
      this.inTx = false;
      this.releaseLock?.();
      this.releaseLock = undefined;
    }
  }
}
