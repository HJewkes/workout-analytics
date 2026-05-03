/**
 * `@voltras/workout-analytics/store/sqlite-expo` test suite.
 *
 * NF-04 / v5R-16: `expo-sqlite` is a React Native native module; importing
 * it in plain Node fails — `expo-sqlite` re-exports through `react-native`,
 * which uses Flow syntax that Node / Vite cannot parse. The package's own
 * CI runs Node-only, so the runtime suite is gated behind the
 * `EXPO_TEST=1` environment variable: when set, the test file dynamically
 * imports the factory and runs `runStoreTests` plus the Expo-specific
 * concurrency / pragma assertions. When unset (the default in Node CI),
 * `describe.skipIf` skips every block — Vite never has to transform
 * `expo-sqlite`'s graph because the imports are dynamic.
 *
 * Type imports below resolve at typecheck time regardless of the env var
 * — that is the build-time signal v5R-16 calls out (`tsc` resolves
 * `expo-sqlite/package.json#exports`).
 *
 * Functional verification on real devices / simulators is owned by
 * `voltras/mobile`'s Expo SDK 54+ CI integration.
 */

import { describe, expect, it, vi } from 'vitest';

import { runStoreTests, type StoreFactory } from '../../store/store.shared.js';
import type { SessionStore } from '../../store/session-store.js';

// Type-only imports keep the typecheck signal alive while ensuring the
// runtime test bundle never statically pulls in expo-sqlite.
type CreateSqliteExpoStore = (options: { path: string }) => Promise<SessionStore>;

const expoSqliteAvailable = process.env.EXPO_TEST === '1';

// ---------------------------------------------------------------- shared suite

if (expoSqliteAvailable) {
  // Lazy import via a thunk — runStoreTests calls the factory inside
  // beforeEach, which is async, so we can dynamic-import then.
  const factory: StoreFactory = async () => {
    const mod = (await import('../../store/sqlite-expo/index.js')) as {
      createSqliteExpoStore: CreateSqliteExpoStore;
    };
    return mod.createSqliteExpoStore({ path: ':memory:' });
  };
  runStoreTests('sqlite-expo', factory);
}

// ---------------------------------------------------------------- expo-specific

describe.skipIf(!expoSqliteAvailable)('sqlite-expo specifics', () => {
  // ------------------------------------------------------------ AC-32 (Expo concurrency mutex)
  it('AC-32 / AC-CONCURRENCY: a second beginExclusive resolves only after the first commit (v5R-1)', async () => {
    const expo = await import('expo-sqlite');
    const driverMod = (await import('../../store/sqlite-expo/driver.js')) as {
      ExpoSqliteDriver: new (db: Awaited<ReturnType<typeof expo.openDatabaseAsync>>) => {
        beginExclusive(): Promise<void>;
        commit(): Promise<void>;
        rollback(): Promise<void>;
      };
    };

    const db = await expo.openDatabaseAsync(':memory:');
    const driver = new driverMod.ExpoSqliteDriver(db);

    const events: string[] = [];
    const execSpy = vi.spyOn(db, 'execAsync');

    // First caller acquires the lock and pauses before commit.
    await driver.beginExclusive();
    events.push('first:begin');

    // Second caller's beginExclusive MUST queue.
    let secondBegan = false;
    const secondStarted = (async () => {
      await driver.beginExclusive();
      secondBegan = true;
      events.push('second:begin');
      await driver.commit();
      events.push('second:commit');
    })();

    // Yield the event loop several times to give the second caller every
    // chance to race ahead. It must not begin yet.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(secondBegan).toBe(false);

    // Now release the first caller's lock.
    await driver.commit();
    events.push('first:commit');
    await secondStarted;

    expect(events).toEqual(['first:begin', 'first:commit', 'second:begin', 'second:commit']);

    const beginCalls = execSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('BEGIN')
    );
    const commitCalls = execSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0] === 'COMMIT'
    );
    expect(beginCalls.length).toBe(2);
    expect(commitCalls.length).toBe(2);

    await db.closeAsync();
  });

  // ------------------------------------------------------------ AC-08 Expo (PRAGMAs on tmpdir file)
  it('AC-08 / AC-WAL-READBACK: PRAGMAs apply per connection on a tmpdir file', async () => {
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { randomUUID } = await import('node:crypto');
    const { unlink } = await import('node:fs/promises');
    const expo = await import('expo-sqlite');
    const factoryMod = (await import('../../store/sqlite-expo/index.js')) as {
      createSqliteExpoStore: CreateSqliteExpoStore;
    };

    const tmpFile = join(tmpdir(), `wa-expo-${randomUUID()}.sqlite`);
    const store = await factoryMod.createSqliteExpoStore({ path: tmpFile });

    const probe = await expo.openDatabaseAsync(tmpFile);
    const jm = await probe.getAllAsync<{ journal_mode: string }>('PRAGMA journal_mode;');
    expect(jm[0]?.journal_mode).toBe('wal');

    await probe.closeAsync();
    await store.close();
    try {
      await unlink(tmpFile);
    } catch {
      // tolerate WAL/SHM siblings — best-effort
    }
  });
});
