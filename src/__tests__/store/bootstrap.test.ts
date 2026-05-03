/**
 * `applyConnectionPragmas` real-driver tests against `better-sqlite3` opened
 * on a tmpdir-backed file (D10 / AC-09 / AC-36).
 *
 * Covers:
 *   - AC-08 (Node side): `PRAGMA foreign_keys` is `1` and
 *     `PRAGMA journal_mode` is `wal` after `applyConnectionPragmas`.
 *   - AC-09: WAL is exercised on a real file (tmpdir, not `:memory:` — WAL
 *     can't operate on in-memory databases).
 *   - AC-36 / v5R-9: if WAL fallback occurs (the engine refuses and returns
 *     a non-`wal` mode), `applyConnectionPragmas` throws `StoreError`.
 *
 * We can't easily force a real WAL fallback in a unit test, so the AC-36
 * branch is exercised with a stub driver whose `selectAll('PRAGMA
 * journal_mode;')` returns `'delete'`.
 */

import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { applyConnectionPragmas, type PragmaDriver } from '@/store/bootstrap';
import { StoreError } from '@/store/errors';
import { BetterSqlite3Driver } from '@/store/sqlite-node/driver';

interface TempDbHandle {
  path: string;
  db: InstanceType<typeof Database>;
}

const handles: TempDbHandle[] = [];

function openTempDb(): TempDbHandle {
  const path = join(tmpdir(), `wa-store-test-${randomUUID()}.sqlite`);
  const db = new Database(path);
  const handle: TempDbHandle = { path, db };
  handles.push(handle);
  return handle;
}

afterEach(() => {
  while (handles.length > 0) {
    const handle = handles.pop()!;
    try {
      handle.db.close();
    } catch {
      // already closed by the test
    }
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const file = handle.path + suffix;
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // best-effort cleanup
        }
      }
    }
  }
});

describe('applyConnectionPragmas (real better-sqlite3 / AC-08 / AC-09)', () => {
  it('enables foreign keys on the connection', async () => {
    const { db } = openTempDb();
    const driver = new BetterSqlite3Driver(db);

    await applyConnectionPragmas(driver);

    const row = db.prepare('PRAGMA foreign_keys;').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });

  it('enables WAL journal mode on the connection (AC-08 / AC-09)', async () => {
    const { db } = openTempDb();
    const driver = new BetterSqlite3Driver(db);

    await applyConnectionPragmas(driver);

    const row = db.prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('wal');
  });
});

describe('applyConnectionPragmas WAL fallback (AC-36 / v5R-9)', () => {
  it('throws StoreError when journal_mode read-back is not "wal"', async () => {
    const stubDriver: PragmaDriver = {
      exec: () => Promise.resolve(),
      selectAll: (sql: string) => {
        if (sql.startsWith('PRAGMA journal_mode')) {
          return Promise.resolve([{ journal_mode: 'delete' }]);
        }
        return Promise.resolve([]);
      },
    };

    await expect(applyConnectionPragmas(stubDriver)).rejects.toBeInstanceOf(StoreError);
    await expect(applyConnectionPragmas(stubDriver)).rejects.toThrow(/failed to enable WAL/);
  });
});
