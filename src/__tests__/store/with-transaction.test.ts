/**
 * `withTransaction` mock-driver tests.
 *
 * Two driver shapes:
 *   1. Sync `transaction(fn)()` — Node / better-sqlite3.
 *   2. Async `beginExclusive` / `commit` / `rollback` — Expo / expo-sqlite.
 *
 * Both shapes commit on success and rollback on throw, with the original
 * error rethrown unchanged. AC-14.
 */

import { describe, expect, it } from 'vitest';
import {
  type AsyncTransactionalDriver,
  type SyncTransactionalDriver,
  withTransaction,
} from '@/store/with-transaction';

describe('withTransaction (sync transaction(fn) shape — Node)', () => {
  it('runs fn inside the wrapped transaction and returns its value', async () => {
    const calls: string[] = [];
    const driver: SyncTransactionalDriver = {
      transaction<T>(fn: () => T) {
        return () => {
          calls.push('begin');
          const result = fn();
          calls.push('commit');
          return result;
        };
      },
    };

    const result = await withTransaction(driver, () => {
      calls.push('body');
      return 42;
    });

    expect(result).toBe(42);
    expect(calls).toEqual(['begin', 'body', 'commit']);
  });

  it('rethrows fn errors (the wrapper handles its own ROLLBACK)', async () => {
    const calls: string[] = [];
    const driver: SyncTransactionalDriver = {
      transaction<T>(fn: () => T) {
        return () => {
          calls.push('begin');
          try {
            const result = fn();
            calls.push('commit');
            return result;
          } catch (e) {
            calls.push('rollback');
            throw e;
          }
        };
      },
    };

    const original = new Error('boom');
    await expect(
      withTransaction(driver, () => {
        throw original;
      })
    ).rejects.toBe(original);

    expect(calls).toEqual(['begin', 'rollback']);
  });

  it('awaits async fn results when the body is async', async () => {
    const driver: SyncTransactionalDriver = {
      transaction<T>(fn: () => T) {
        return () => fn();
      },
    };

    const result = await withTransaction(driver, async () => {
      return 'ok';
    });

    expect(result).toBe('ok');
  });
});

describe('withTransaction (async beginExclusive / commit / rollback — Expo)', () => {
  function makeAsyncDriver(): {
    driver: AsyncTransactionalDriver;
    calls: string[];
  } {
    const calls: string[] = [];
    const driver: AsyncTransactionalDriver = {
      async beginExclusive() {
        calls.push('begin');
      },
      async commit() {
        calls.push('commit');
      },
      async rollback() {
        calls.push('rollback');
      },
    };
    return { driver, calls };
  }

  it('begin/body/commit on success and returns the value', async () => {
    const { driver, calls } = makeAsyncDriver();

    const result = await withTransaction(driver, async () => {
      calls.push('body');
      return 'value';
    });

    expect(result).toBe('value');
    expect(calls).toEqual(['begin', 'body', 'commit']);
  });

  it('begin/rollback on throw, original error rethrown unchanged', async () => {
    const { driver, calls } = makeAsyncDriver();

    const original = new Error('body failed');
    await expect(
      withTransaction(driver, async () => {
        throw original;
      })
    ).rejects.toBe(original);

    expect(calls).toEqual(['begin', 'rollback']);
  });

  it('rollback runs even if the body throws synchronously', async () => {
    const { driver, calls } = makeAsyncDriver();

    const original = new Error('sync throw');
    await expect(
      withTransaction(driver, () => {
        throw original;
      })
    ).rejects.toBe(original);

    expect(calls).toEqual(['begin', 'rollback']);
  });
});

describe('withTransaction discrimination', () => {
  it('chooses the sync path when `transaction` is present', async () => {
    let pickedSync = false;
    const driver: SyncTransactionalDriver = {
      transaction<T>(fn: () => T) {
        return () => {
          pickedSync = true;
          return fn();
        };
      },
    };
    await withTransaction(driver, () => 0);
    expect(pickedSync).toBe(true);
  });

  it('chooses the async path when `transaction` is absent', async () => {
    let pickedAsync = false;
    const driver: AsyncTransactionalDriver = {
      async beginExclusive() {
        pickedAsync = true;
      },
      async commit() {},
      async rollback() {},
    };
    await withTransaction(driver, () => 0);
    expect(pickedAsync).toBe(true);
  });
});
