/**
 * `BetterSqlite3Driver` — adapter from `better-sqlite3`'s synchronous API onto
 * the async-uniform driver shape consumed by `MigrationRunner`,
 * `applyConnectionPragmas`, and `withTransaction`.
 *
 * better-sqlite3 is synchronous: `db.exec`, `db.prepare(...).all/run`, and
 * `db.transaction(fn)` all return immediately. The shared store interfaces
 * (`MigrationDriver`, `PragmaDriver`, `SessionStore`) are async, so each
 * method here wraps its sync result in `Promise.resolve(...)`.
 *
 * Transaction shape (v5R-1 / AC-32 — see DEVIATION note below):
 *   `transaction<T>(fn): () => Promise<T>`
 *
 * **Deviation from briefing v5R-1.** The briefing prescribes
 * `(fn) => db.transaction(fn)`. That works for genuinely synchronous `fn`,
 * but the wave-1 `MigrationRunner` (and the Node store's own write paths)
 * pass `async () => { await driver.exec(...); ... }` into
 * `withTransaction` — and better-sqlite3's `db.transaction(fn)` rejects any
 * `fn` whose return is a Promise ("Transaction function cannot return a
 * promise"). Using `db.transaction` would force a rewrite of the migration
 * runner.
 *
 * Instead we issue `BEGIN`/`COMMIT`/`ROLLBACK` manually via `db.exec` —
 * still synchronous — and serialize callers with a JS-level promise chain
 * so two `await`-spaced `withTransaction` invocations cannot BEGIN-BEGIN
 * race (AC-32 / EC-06). The mutex is internal to this driver; it does not
 * leak to the public store interface.
 */

import type { MigrationDriverSql } from '../migration-runner.js';
import type { SyncTransactionalDriver } from '../with-transaction.js';

/**
 * The minimum surface of `better-sqlite3`'s `Database` instance that this
 * driver depends on. Extracted as an interface so tests can stub it without
 * pulling the native binding.
 */
export interface BetterSqlite3Database {
  exec(sql: string): unknown;
  prepare(sql: string): BetterSqlite3Statement;
  close(): unknown;
}

export interface BetterSqlite3Statement {
  all(...params: readonly unknown[]): unknown[];
  run(...params: readonly unknown[]): unknown;
  get(...params: readonly unknown[]): unknown;
}

/**
 * Adapter wrapping a `better-sqlite3` `Database`. Satisfies
 * `MigrationDriverSql` + `SyncTransactionalDriver` (the sync arm of
 * `TransactionalDriver`) so it can flow into `MigrationRunner`,
 * `applyConnectionPragmas`, and `withTransaction` without further casts.
 */
export class BetterSqlite3Driver implements MigrationDriverSql, SyncTransactionalDriver {
  /** Promise-mutex tail; serializes overlapping transactions (AC-32). */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: BetterSqlite3Database) {}

  exec(sql: string): Promise<void> {
    this.db.exec(sql);
    return Promise.resolve();
  }

  selectAll(sql: string, params: readonly unknown[] = []): Promise<unknown[]> {
    const rows = this.db.prepare(sql).all(...params);
    return Promise.resolve(rows);
  }

  run(sql: string, params: readonly unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
    return Promise.resolve();
  }

  /**
   * Sync-transactional shape (v5R-1, with the deviation noted at the top of
   * this file). Returns a callable that, when invoked, runs `BEGIN`,
   * executes `fn` (awaiting it if it returns a Promise), then `COMMIT` —
   * or `ROLLBACK` and rethrow on error. Concurrent calls are serialized via
   * the driver's internal promise chain.
   *
   * The return type matches the `SyncTransactionalDriver` shape (`() => T`).
   * Callers always pass an async fn (T = Promise<U>), so the wrapper
   * resolves to a Promise — `withTransaction` then awaits it.
   */
  transaction<T>(fn: () => T): () => T {
    return ((): Promise<unknown> => {
      const next = this.chain.then(async () => {
        this.db.exec('BEGIN');
        try {
          const result = await fn();
          this.db.exec('COMMIT');
          return result;
        } catch (err) {
          try {
            this.db.exec('ROLLBACK');
          } catch {
            // Best-effort rollback. Surface the original error.
          }
          throw err;
        }
      });
      // Keep the chain alive on rejection so subsequent callers don't
      // inherit the failure.
      this.chain = next.catch(() => undefined);
      return next;
    }) as () => T;
  }
}
