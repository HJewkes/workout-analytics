/**
 * `applyConnectionPragmas` — issue connection-scoped PRAGMAs against the
 * driver and verify WAL was actually enabled (v5R-9 / AC-08 / AC-WAL-READBACK).
 *
 * SQLite's `PRAGMA journal_mode = WAL` can return `'delete'` (or another
 * mode) if the engine refuses — typically because the database file is on a
 * filesystem that doesn't support memory-mapped I/O (e.g. a network share).
 * The store can't safely operate without WAL, so we read back the actual mode
 * and throw `StoreError` on mismatch.
 *
 * Foreign keys must be turned on per-connection (the SQLite default is OFF).
 * This is independent of WAL — a connection may have FKs enabled without
 * WAL, but the schema's `ON DELETE CASCADE` clauses won't fire without it.
 */

import { StoreError } from './errors.js';

interface JournalModeRow {
  readonly journal_mode: string;
}

/**
 * Minimal driver interface for connection-scoped pragmas.
 */
export interface PragmaDriver {
  exec(sql: string): Promise<void> | void;
  selectAll(sql: string, params?: readonly unknown[]): Promise<unknown[]> | unknown[];
}

export async function applyConnectionPragmas(driver: PragmaDriver): Promise<void> {
  await driver.exec('PRAGMA foreign_keys = ON;');
  await driver.exec('PRAGMA journal_mode = WAL;');
  const rows = (await driver.selectAll('PRAGMA journal_mode;')) as readonly JournalModeRow[];
  const actual = rows[0]?.journal_mode;
  if (actual !== 'wal') {
    throw new StoreError(`failed to enable WAL: got ${String(actual)}`);
  }
}
