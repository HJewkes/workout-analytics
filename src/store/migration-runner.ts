/**
 * `MigrationRunner` — bootstraps the `__migrations` bookkeeping table,
 * validates the input migration array, and applies any unapplied migrations
 * inside a transaction with hash verification.
 *
 * Order of operations (`run`):
 *
 *   1. Reject empty array (D12 / EC-01).
 *   2. Validate the sequence is contiguous 1..N starting at 1, sorted
 *      ascending (v5R-6 / AC-MIG-SEQ). Rejection here happens BEFORE any
 *      DDL is issued.
 *   3. Bootstrap the `__migrations` table (idempotent; AC-10). DDL failure
 *      becomes `MigrationError` (FIX-4 / AC-18 / EC-05).
 *   4. Read applied versions.
 *   5. For each unapplied migration: verify SHA-256 (FIX-2 / EC-02 / EC-07),
 *      apply the SQL inside `withTransaction`, and record the row in
 *      `__migrations`.
 *
 * The driver abstraction here is the minimum needed: an `exec` for DDL, a
 * `selectAll` for the version read, plus the `TransactionalDriver` shape.
 * The driver implementations in WA-04.04 / WA-04.05 wrap their native SQLite
 * APIs to satisfy this interface.
 */

import { createHash } from 'node:crypto';
import type { Migration } from '../schema/migrations/index.js';
import { MigrationError } from './errors.js';
import { type TransactionalDriver, withTransaction } from './with-transaction.js';

/**
 * Minimal driver interface the migration runner needs.
 *
 * `MigrationDriver` is the intersection of SQL access (`exec`, `selectAll`,
 * `run`) with one of the two `TransactionalDriver` shapes — drivers
 * implement either the sync `transaction(fn)` shape or the async
 * `beginExclusive`/`commit`/`rollback` shape. `withTransaction` discriminates
 * at call time.
 */
export interface MigrationDriverSql {
  /** Issue raw SQL (DDL or multi-statement). */
  exec(sql: string): Promise<void> | void;

  /**
   * Run a parameterized statement that returns rows (typed as `unknown[]` —
   * the runner casts).
   */
  selectAll(sql: string, params?: readonly unknown[]): Promise<unknown[]> | unknown[];

  /** Run a parameterized statement that doesn't return rows. */
  run(sql: string, params?: readonly unknown[]): Promise<void> | void;
}

export type MigrationDriver = MigrationDriverSql & TransactionalDriver;

const BOOTSTRAP_SQL =
  'CREATE TABLE IF NOT EXISTS __migrations (\n' +
  '  version INTEGER PRIMARY KEY,\n' +
  '  sha256 TEXT NOT NULL,\n' +
  '  applied_at INTEGER NOT NULL DEFAULT (unixepoch())\n' +
  ');';

interface MigrationRow {
  readonly version: number;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function validateSequence(migrations: readonly Migration[]): void {
  if (migrations.length === 0) {
    throw new MigrationError('migrations array is empty');
  }
  const observed = migrations.map((m) => m.version).join(',');
  for (let i = 0; i < migrations.length; i++) {
    if (migrations[i]!.version !== i + 1) {
      throw new MigrationError(
        `migrations must be contiguous 1..N starting at 1, sorted ascending; got: ${observed}`
      );
    }
  }
}

export class MigrationRunner {
  private bootstrapped = false;

  constructor(private readonly driver: MigrationDriver) {}

  /**
   * Ensure the `__migrations` table exists. Idempotent. Wraps any DDL error
   * in `MigrationError` (FIX-4 / AC-18).
   */
  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return;
    try {
      await this.driver.exec(BOOTSTRAP_SQL);
    } catch (err) {
      throw new MigrationError('failed to create __migrations table', { cause: err });
    }
    this.bootstrapped = true;
  }

  /**
   * Return the sorted list of versions present in `__migrations`.
   * Bootstrap is idempotent and runs first so callers can use this
   * pre-`run`.
   */
  async getAppliedVersions(): Promise<number[]> {
    await this.bootstrap();
    const rows = (await this.driver.selectAll(
      'SELECT version FROM __migrations ORDER BY version ASC'
    )) as readonly MigrationRow[];
    return rows.map((r) => r.version);
  }

  /**
   * Apply any unapplied migrations from the input array. See file header
   * for ordering invariants.
   */
  async run(migrations: readonly Migration[]): Promise<void> {
    // Steps 1+2: validate BEFORE any DDL.
    validateSequence(migrations);

    // Step 3: bootstrap.
    await this.bootstrap();

    // Step 4: applied set.
    const applied = new Set(await this.getAppliedVersions());

    // Step 5: apply missing.
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;

      const actualHash = sha256Hex(migration.sql);
      if (actualHash !== migration.sha256) {
        throw new MigrationError(
          `hash mismatch for migration ${migration.version}: ` +
            `expected ${migration.sha256}, got ${actualHash}`
        );
      }

      await withTransaction(this.driver, async () => {
        await this.driver.exec(migration.sql);
        await this.driver.run('INSERT INTO __migrations (version, sha256) VALUES (?, ?)', [
          migration.version,
          migration.sha256,
        ]);
      });
    }
  }
}
