/**
 * `@voltras/workout-analytics/store` — driver-agnostic storage primitives.
 *
 * Drivers (`./store/sqlite-node`, `./store/sqlite-expo`) build on top of
 * these — they import `MigrationRunner`, `applyConnectionPragmas`,
 * `withTransaction`, `prepareForSave`, the error classes, and the
 * `SessionStore` interface. Application code typically uses one of the
 * driver subpaths directly.
 */

export { MigrationError, StoreError, ValidationError } from './errors.js';
export type { SessionStore } from './session-store.js';
export { prepareForSave } from './prepare-for-save.js';
export {
  type AsyncTransactionalDriver,
  type SyncTransactionalDriver,
  type TransactionalDriver,
  withTransaction,
} from './with-transaction.js';
export {
  type MigrationDriver,
  type MigrationDriverSql,
  MigrationRunner,
} from './migration-runner.js';
export { applyConnectionPragmas, type PragmaDriver } from './bootstrap.js';

// `store.shared.ts` (test harness + fixtures) is intentionally NOT re-exported
// here — it imports `vitest` and is only consumed by driver test files.
// Driver tests import it directly via `../../store/store.shared.js` (or an
// equivalent relative path).
