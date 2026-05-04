/**
 * `@voltras/workout-analytics/schema` — typed records, validators, migration data.
 *
 * Reached via the package's `exports` map; not re-exported from the root barrel.
 */

export type { RepRecord, SchemaVersion, Session, SetRecord } from './types.js';
export { repRecordSchema, setRecordSchema, sessionSchema } from './validators.js';
export { MIGRATIONS, type Migration } from './migrations/index.js';
