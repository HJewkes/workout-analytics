/**
 * `createSqliteNodeStore` driver tests.
 *
 * - Inherits the cross-driver conformance suite via
 *   `runStoreTests('sqlite-node', factory)`.
 * - Adds Node-specific tests for AC-21 (open-error wrapping), AC-22 (default
 *   `createRequire` resolver), AC-23 (custom resolver injection), AC-24 (no
 *   CJS branch in `require-peer.ts`).
 *
 * The factory points each conformance test at a fresh tmpdir-backed file.
 * Files (and their `-wal`/`-shm` siblings) are cleaned up in `afterAll`.
 */

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runStoreTests } from '@/store/store.shared';
import { StoreError } from '@/store/errors';
import { createSqliteNodeStore } from '@/store/sqlite-node';
import { createRequirePeerResolver } from '@/store/sqlite-node/require-peer';

const createdPaths: string[] = [];

function tmpDbPath(): string {
  const path = join(tmpdir(), `wa-sqlite-node-${randomUUID()}.sqlite`);
  createdPaths.push(path);
  return path;
}

afterAll(() => {
  for (const path of createdPaths) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const file = path + suffix;
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // best-effort
        }
      }
    }
  }
});

// ----------------------------------------------------------- shared suite
runStoreTests('sqlite-node', () => createSqliteNodeStore({ path: tmpDbPath() }));

// ----------------------------------------------------------- Node-specific
describe('createSqliteNodeStore — Node-specific contract', () => {
  it('wraps a native open error as StoreError with cause (AC-21 / D15)', async () => {
    // Use a custom resolver that returns a constructor which throws on
    // construction — emulates the native binding rejecting a bad path.
    class ThrowingDb {
      constructor() {
        throw new Error('mock native open failure');
      }
    }
    const resolver = vi.fn().mockReturnValue(ThrowingDb);

    await expect(
      createSqliteNodeStore({ path: '/dev/null/never', resolver })
    ).rejects.toMatchObject({
      name: 'StoreError',
      message: /failed to open database: mock native open failure/,
    });
    // The original error must be preserved as `cause`.
    try {
      await createSqliteNodeStore({ path: '/dev/null/never', resolver });
    } catch (err) {
      expect(err).toBeInstanceOf(StoreError);
      expect((err as Error & { cause?: Error }).cause).toBeInstanceOf(Error);
      expect(((err as Error & { cause?: Error }).cause as Error).message).toBe(
        'mock native open failure'
      );
    }
  });

  it('default resolver resolves "better-sqlite3" via createRequire (AC-22)', async () => {
    const resolver = createRequirePeerResolver();
    const Database = resolver('better-sqlite3') as new (path: string) => { close(): void };
    expect(typeof Database).toBe('function');
    // Sanity: opening an in-memory DB through the resolver works end-to-end.
    const db = new Database(':memory:');
    db.close();
  });

  it('uses an injected custom resolver exactly once with "better-sqlite3" (AC-23 / v3-FIX-1)', async () => {
    // Spy on the default resolver and pass it as `resolver`.
    const realResolver = createRequirePeerResolver();
    const spy = vi.fn((name: string) => realResolver(name));

    const store = await createSqliteNodeStore({ path: tmpDbPath(), resolver: spy });
    try {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('better-sqlite3');
    } finally {
      await store.close();
    }
  });

  it('contains no `typeof require` CJS-detection branch in require-peer.ts (AC-24 / D-ESM)', () => {
    // Static-analysis test: read the source and grep for the dead-code
    // pattern. The single ESM code path is `createRequire(import.meta.url)`.
    const src = readFileSync(resolve(__dirname, '../../store/sqlite-node/require-peer.ts'), 'utf8');
    expect(src).not.toMatch(/typeof\s+require\s*===?\s*['"]function['"]/);
    expect(src).toMatch(/createRequire\s*\(\s*import\.meta\.url\s*\)/);
  });

  it('saveReps([]) issues no SQL — no BEGIN, no INSERT (v5R-3 / EC-14)', async () => {
    // Wrap the underlying better-sqlite3 Database with a spy so we can prove
    // saveReps([]) short-circuits before touching SQL. We open a real DB
    // first (so the resolver's normal path runs once, allowing migrations
    // to apply), then snapshot the spy AFTER the factory completes — only
    // calls that happen inside `saveReps([])` are counted.
    type DbCtor = new (path: string) => {
      exec(sql: string): unknown;
      prepare(sql: string): unknown;
      close(): unknown;
    };

    const realResolver = createRequirePeerResolver();
    const execSpy = vi.fn();
    const prepareSpy = vi.fn();

    const wrappingResolver = (name: string): unknown => {
      const Real = realResolver(name) as DbCtor;
      return class WrappedDb {
        private real: InstanceType<DbCtor>;
        constructor(p: string) {
          this.real = new Real(p);
        }
        exec(sql: string): unknown {
          execSpy(sql);
          return this.real.exec(sql);
        }
        prepare(sql: string): unknown {
          prepareSpy(sql);
          return this.real.prepare(sql);
        }
        close(): unknown {
          return this.real.close();
        }
      };
    };

    const store = await createSqliteNodeStore({
      path: tmpDbPath(),
      resolver: wrappingResolver,
    });

    // Reset spies AFTER factory: only count saveReps([]) calls.
    execSpy.mockClear();
    prepareSpy.mockClear();

    try {
      await store.saveReps([]);
      expect(execSpy).not.toHaveBeenCalled();
      expect(prepareSpy).not.toHaveBeenCalled();
    } finally {
      await store.close();
    }
  });

  it('latestAppliedVersion is reflected in persisted records (AC-30 / AC-31 Node)', async () => {
    const path = tmpDbPath();
    const store = await createSqliteNodeStore({ path });
    try {
      await store.saveSession({
        id: 'sess-version',
        startedAt: 1,
        schemaVersion: 999,
      });
      const out = await store.getSession('sess-version');
      expect(out!.schemaVersion).toBe(1);
    } finally {
      await store.close();
    }

    // Re-open: latestAppliedVersion derives from __migrations, not from input.
    const store2 = await createSqliteNodeStore({ path });
    try {
      const out = await store2.getSession('sess-version');
      expect(out!.schemaVersion).toBe(1);
    } finally {
      await store2.close();
    }
  });
});
