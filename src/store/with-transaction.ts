/**
 * `withTransaction` — driver-shape-aware transaction shim (v5R-1).
 *
 * Two driver shapes are supported:
 *
 *   1. **Sync `transaction` (Node / better-sqlite3)** — `db.transaction(fn)`
 *      returns a wrapped function that, when called, runs `fn` inside a
 *      BEGIN/COMMIT pair. SQLite handles the locking; no event-loop
 *      interleaving is possible because the call is synchronous.
 *
 *   2. **Async begin/commit/rollback (Expo / expo-sqlite)** — issued
 *      explicitly. The Expo driver wraps an internal Promise mutex so two
 *      concurrent `withTransaction` callers don't BEGIN-BEGIN; that mutex is
 *      not part of this shim's contract.
 *
 * The discriminator is the literal presence of a `transaction` method.
 * (`'transaction' in driver`).
 */

export interface SyncTransactionalDriver {
  transaction<T>(fn: () => T): () => T;
}

export interface AsyncTransactionalDriver {
  beginExclusive(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type TransactionalDriver = SyncTransactionalDriver | AsyncTransactionalDriver;

function isSync(driver: TransactionalDriver): driver is SyncTransactionalDriver {
  return 'transaction' in driver;
}

export async function withTransaction<T>(
  driver: TransactionalDriver,
  fn: () => Promise<T> | T
): Promise<T> {
  if (isSync(driver)) {
    // better-sqlite3: db.transaction(fn) returns a wrapped fn; calling it
    // runs BEGIN/COMMIT/ROLLBACK around the body. SQLite serializes via the
    // engine's own lock — no event-loop interleaving here.
    const wrapped = driver.transaction(fn as () => T);
    return wrapped();
  }

  await driver.beginExclusive();
  try {
    const result = await fn();
    await driver.commit();
    return result;
  } catch (err) {
    await driver.rollback();
    throw err;
  }
}
