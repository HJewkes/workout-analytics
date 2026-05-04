/**
 * `MigrationRunner` mock-driver tests.
 *
 * Covers EC-01 (empty array), EC-02 (hash mismatch), EC-05 (DDL bootstrap
 * failure), EC-07 (re-applying same version is a no-op), EC-11 (sequence
 * gap), EC-12 (sequence not starting at 1), EC-13 (sequence out of order),
 * AC-39 (`__migrations` table shape).
 *
 * No real SQLite — a tiny in-memory mock driver records calls and returns
 * canned results. The actual SQL is never executed; this tests the runner's
 * orchestration logic only.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Migration } from '@/schema/migrations';
import { MigrationError } from '@/store/errors';
import { type MigrationDriver, MigrationRunner } from '@/store/migration-runner';

interface ExecCall {
  type: 'exec';
  sql: string;
}
interface RunCall {
  type: 'run';
  sql: string;
  params: readonly unknown[];
}
interface SelectCall {
  type: 'selectAll';
  sql: string;
  params: readonly unknown[];
}
type Call = ExecCall | RunCall | SelectCall;

interface MockDriverOptions {
  /** Pre-applied versions (rows in `__migrations`). */
  appliedVersions?: number[];
  /** Throw on first `exec` call. */
  failBootstrap?: boolean;
}

/**
 * Mock driver implementing the sync `transaction(fn)` shape so we exercise
 * the same withTransaction path Node uses. Tracks calls in `calls`.
 */
function makeDriver(options: MockDriverOptions = {}): MigrationDriver & { calls: Call[] } {
  const calls: Call[] = [];
  const persistedVersions = new Set<number>(options.appliedVersions ?? []);
  let bootstrapped = false;

  return {
    calls,
    exec(sql) {
      calls.push({ type: 'exec', sql });
      if (sql.includes('__migrations') && options.failBootstrap && !bootstrapped) {
        throw new Error('mock DDL failure');
      }
      if (sql.includes('__migrations')) {
        bootstrapped = true;
      }
    },
    selectAll(sql, params = []) {
      calls.push({ type: 'selectAll', sql, params });
      if (sql.startsWith('SELECT version FROM __migrations')) {
        return Array.from(persistedVersions)
          .sort((a, b) => a - b)
          .map((v) => ({ version: v }));
      }
      return [];
    },
    run(sql, params = []) {
      calls.push({ type: 'run', sql, params });
      if (sql.startsWith('INSERT INTO __migrations')) {
        const version = params[0] as number;
        persistedVersions.add(version);
      }
    },
    transaction<T>(fn: () => T) {
      return () => fn();
    },
  };
}

function fakeMigration(version: number, sql: string): Migration {
  return {
    version,
    sql,
    sha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
  };
}

describe('MigrationRunner', () => {
  it('rejects an empty migrations array (EC-01 / D12) before any DDL', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    await expect(runner.run([])).rejects.toBeInstanceOf(MigrationError);
    await expect(runner.run([])).rejects.toThrow(/empty/);
    expect(driver.calls).toHaveLength(0);
  });

  it('wraps __migrations bootstrap DDL failure as MigrationError (EC-05 / FIX-4 / AC-18)', async () => {
    const driver = makeDriver({ failBootstrap: true });
    const runner = new MigrationRunner(driver);

    await expect(
      runner.run([fakeMigration(1, 'CREATE TABLE t (id INTEGER);')])
    ).rejects.toBeInstanceOf(MigrationError);
    // First call attempted bootstrap; nothing else happens.
    const execCalls = driver.calls.filter((c) => c.type === 'exec');
    expect(execCalls.length).toBeGreaterThanOrEqual(1);
    expect(execCalls[0]!.sql).toContain('__migrations');
  });

  it('throws MigrationError on hash mismatch (EC-02 / FIX-2)', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    const tampered: Migration = {
      version: 1,
      sql: 'CREATE TABLE t (id INTEGER);',
      sha256: 'deadbeef'.repeat(8), // 64 hex chars but wrong
    };

    await expect(runner.run([tampered])).rejects.toBeInstanceOf(MigrationError);
    await expect(runner.run([tampered])).rejects.toThrow(/hash mismatch/);
  });

  it('skips already-applied versions when hashes match (EC-07)', async () => {
    const m = fakeMigration(1, 'CREATE TABLE t (id INTEGER);');
    const driver = makeDriver({ appliedVersions: [1] });
    const runner = new MigrationRunner(driver);

    await runner.run([m]);

    // No INSERT into __migrations should occur (version already applied).
    const inserts = driver.calls.filter(
      (c) => c.type === 'run' && c.sql.startsWith('INSERT INTO __migrations')
    );
    expect(inserts).toHaveLength(0);

    // No CREATE TABLE t exec either (the migration was skipped).
    const tCreate = driver.calls.filter(
      (c) => c.type === 'exec' && c.sql === 'CREATE TABLE t (id INTEGER);'
    );
    expect(tCreate).toHaveLength(0);
  });

  it('rejects sequence with gap (EC-11 / EC-SEQ-GAP) before any DDL', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    const migrations = [
      fakeMigration(1, 'CREATE TABLE a (x INTEGER);'),
      fakeMigration(3, 'CREATE TABLE c (x INTEGER);'),
    ];

    await expect(runner.run(migrations)).rejects.toBeInstanceOf(MigrationError);
    await expect(runner.run(migrations)).rejects.toThrow(/contiguous/);
    expect(driver.calls).toHaveLength(0);
  });

  it('rejects sequence not starting at 1 (EC-12 / EC-SEQ-START)', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    const migrations = [fakeMigration(2, 'CREATE TABLE b (x INTEGER);')];

    await expect(runner.run(migrations)).rejects.toBeInstanceOf(MigrationError);
    expect(driver.calls).toHaveLength(0);
  });

  it('rejects sequence out of order (EC-13)', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    const migrations = [
      fakeMigration(2, 'CREATE TABLE b (x INTEGER);'),
      fakeMigration(1, 'CREATE TABLE a (x INTEGER);'),
    ];

    await expect(runner.run(migrations)).rejects.toBeInstanceOf(MigrationError);
    expect(driver.calls).toHaveLength(0);
  });

  it('bootstraps __migrations with the documented column shape (AC-39 / AC-MIG-COLS / v5R-5)', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    await runner.bootstrap();

    const ddl = driver.calls.find((c) => c.type === 'exec' && c.sql.includes('__migrations'));
    expect(ddl).toBeDefined();
    expect(ddl!.type).toBe('exec');
    const sql = (ddl as ExecCall).sql;
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS __migrations');
    expect(sql).toContain('version INTEGER PRIMARY KEY');
    expect(sql).toContain('sha256 TEXT NOT NULL');
    expect(sql).toContain('applied_at INTEGER NOT NULL DEFAULT (unixepoch())');
  });

  it('applies a missing migration: bootstrap, hash check, exec, insert in __migrations', async () => {
    const driver = makeDriver();
    const runner = new MigrationRunner(driver);

    const m = fakeMigration(1, 'CREATE TABLE foo (id INTEGER);');
    await runner.run([m]);

    const inserts = driver.calls.filter(
      (c) => c.type === 'run' && c.sql.startsWith('INSERT INTO __migrations')
    ) as RunCall[];
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.params).toEqual([1, m.sha256]);

    const fooCreate = driver.calls.find(
      (c) => c.type === 'exec' && c.sql === 'CREATE TABLE foo (id INTEGER);'
    );
    expect(fooCreate).toBeDefined();
  });

  it('getAppliedVersions returns the persisted version list (sorted ascending)', async () => {
    const driver = makeDriver({ appliedVersions: [2, 1, 3] });
    const runner = new MigrationRunner(driver);

    const versions = await runner.getAppliedVersions();
    expect(versions).toEqual([1, 2, 3]);
  });
});
