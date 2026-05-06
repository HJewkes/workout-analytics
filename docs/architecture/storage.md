# Storage layer

Persistence is opt-in and lives behind separate subpath exports. The analytics surface (`@voltras/workout-analytics`) is independent — a consumer can run the whole VBT pipeline in memory and never import a store.

## Table of contents

- [Subpath layout and peer deps](#subpath-layout-and-peer-deps)
- [Schema](#schema)
- [`SessionStore` interface](#sessionstore-interface)
- [Validation: `prepareForSave`](#validation-prepareforsave)
- [Migrations](#migrations)
- [Connection PRAGMAs](#connection-pragmas)
- [Transaction shim: `withTransaction`](#transaction-shim-withtransaction)
- [Errors](#errors)
- [Drivers](#drivers)
- [Wiring up a store (consumer flow)](#wiring-up-a-store-consumer-flow)
- [Test harness](#test-harness)

## Subpath layout and peer deps

Five subpath exports (`package.json:9-32`):

| Subpath | Source | Optional peer | Purpose |
| --- | --- | --- | --- |
| `@voltras/workout-analytics/schema` | `src/schema/index.ts` | none | Record types + zod validators + `MIGRATIONS`. |
| `@voltras/workout-analytics/store` | `src/store/index.ts` | none | Driver-agnostic primitives. |
| `@voltras/workout-analytics/store/sqlite-node` | `src/store/sqlite-node/index.ts` | `better-sqlite3@^11` | Node driver. |
| `@voltras/workout-analytics/store/sqlite-expo` | `src/store/sqlite-expo/index.ts` | `expo-sqlite@^15` | Expo / React Native driver. |

Peers are flagged optional via `peerDependenciesMeta` (`package.json:65-72`). Consumers install only the driver they need:

```bash
npm install @voltras/workout-analytics better-sqlite3   # Node
npm install @voltras/workout-analytics expo-sqlite      # Expo / RN
```

Reference: `../../README.md` "Subpath exports" section for the consumer-facing examples.

## Schema

Source: `src/schema/types.ts`. Three record types form a parent-child hierarchy.

### Hierarchy

```
Session (1) ──< SetRecord (n) ──< RepRecord (n)
   sessionId ─┘     setId ────────┘
```

FK CASCADE on delete is enforced at the DB layer (`src/schema/migrations/001_initial.sql:19, :29`). Foreign keys must be enabled per-connection — see [Connection PRAGMAs](#connection-pragmas).

### `Session`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Caller-supplied. ID generation is out of scope. |
| `startedAt` | `number` | ms epoch. |
| `endedAt` | `number?` | ms epoch. |
| `exerciseId` | `string?` | Soft link to exercise catalog. Not validated by the store. |
| `deviceId` | `string?` | |
| `notes` | `string?` | |
| `schemaVersion` | `number` | **Overwritten by the store** (D2 / AC-05) on save with the store's `latestAppliedVersion`. |

### `SetRecord`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `sessionId` | `string` | FK to `sessions.id` (CASCADE). |
| `setNumber` | `number` | |
| `loadKg` | `number?` | |
| `loadType` | `'absolute' \| 'percent1RM'?` | |
| `schemaVersion` | `number` | Overwritten on save. |

### `RepRecord`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | |
| `setId` | `string` | FK to `sets.id` (CASCADE). |
| `repNumber` | `number` | |
| `rawSamplesJson` | `string` | **Opaque string** — serialized `{ concentric: WorkoutSample[], eccentric: WorkoutSample[] }`. Probed for JSON-parseability on read (corruption check, v5R-4); the parsed value is discarded. |
| `schemaVersion` | `number` | Overwritten on save. |

### `SchemaVersion`

`type SchemaVersion = number` (`src/schema/types.ts:8`).

### Validators

Source: `src/schema/validators.ts:13-38`. Three zod schemas: `sessionSchema`, `setRecordSchema`, `repRecordSchema`.

**D19 invariant** (`src/schema/validators.ts:1-9`): no `.default()`, `.transform()`, or `.coerce` anywhere. The store's round-trip contract requires validation NOT silently mutate input shape. `validators.test.ts` walks each schema's `_def` and asserts no `ZodEffects` nodes and no `coerce` flags. If you add a new validator, do not introduce these.

## `SessionStore` interface

Source: `src/store/session-store.ts:19-101`. The single public storage interface, implemented by both drivers.

### Methods

| Method | Returns | Behavior |
| --- | --- | --- |
| `saveSession(session)` | `Promise<void>` | Atomic. Validated + shallow-copied via `prepareForSave`. `schemaVersion` overwritten. Throws `StoreError('duplicate id: <id>')` on PK conflict. |
| `saveSet(set)` | `Promise<void>` | Atomic. FK to session is enforced by DB CASCADE — caller must save the parent session first. |
| `saveReps(reps)` | `Promise<void>` | Bulk-atomic. **Empty input is a no-op (no transaction opened)** — v5R-3 / EC-EMPTY-REPS. Each rep validated up-front; partial writes never visible. |
| `getSession(id)` | `Promise<Session \| undefined>` | Returns `undefined` for missing rows (D16 — there is no `NotFoundError`). |
| `getSetsBySession(sessionId)` | `Promise<SetRecord[]>` | Ordered ascending by `set_number`. Empty array for missing session. |
| `getRepsBySet(setId)` | `Promise<RepRecord[]>` | Ordered ascending by `rep_number`. Each rep's `rawSamplesJson` JSON-parse-probed; failure throws `ValidationError('corrupt rawSamples for set <setId>, rep <n>: <msg>')`. |
| `getRecent(limit)` | `Promise<Session[]>` | Newest first by `started_at`. `limit` MUST be non-negative integer (v5R-7) — else `StoreError('invalid limit: <value>')`. `getRecent(0)` returns `[]`. |
| `close()` | `Promise<void>` | **Idempotent** — second call is a no-op (v5R-8). After close, every other method throws `StoreError('store is closed')`. |

### Round-trip contract (D11 / AC-06)

Records returned by reads are deeply equal to the values passed in on save, modulo `schemaVersion` (which the store overwrites with `latestAppliedVersion`).

### Concurrency

All writes serialize through the driver-specific `withTransaction` shim. Concurrent calls cannot BEGIN-BEGIN race (v5R-1 / AC-32). The Node driver uses a JS-level promise mutex around `db.exec('BEGIN'/'COMMIT')`; the Expo driver uses a Promise mutex around `BEGIN EXCLUSIVE`.

## Validation: `prepareForSave`

Source: `src/store/prepare-for-save.ts:22-37`.

```ts
prepareForSave<T extends { schemaVersion: number }>(
  validator: z.ZodType<T>,
  input: T,
  latestAppliedVersion: number,
): T
```

1. `validator.parse(input)` — wraps `ZodError` as `ValidationError(message, { cause: zodError })` so callers don't depend on zod-specific error shapes.
2. Shallow spread `{ ...parsed, schemaVersion: latestAppliedVersion }`.

Why shallow rather than `structuredClone` (`src/store/prepare-for-save.ts:1-13`): records are flat — primitives only. `rawSamplesJson` is opaque per v5R-4. No nested mutables to copy. Shallow spread is portable across Hermes versions and avoids runtime cost. The function MUST NOT mutate `input`.

## Migrations

### Registry

Source: `src/schema/migrations/index.ts`.

```ts
interface Migration {
  readonly version: number;
  readonly sql: string;
  readonly sha256: string;
}

const MIGRATIONS: readonly Migration[];  // currently 1 entry: v1
```

The SQL and hash come from `src/schema/_generated.ts` (`INITIAL_SQL`, `INITIAL_SHA256`). That file is generated by `scripts/migrations-build.mjs` from the SQL files under `src/schema/migrations/`. Run `npm run migrations:build` after editing migration SQL.

### Initial schema (v1)

Source: `src/schema/migrations/001_initial.sql`.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  exercise_id TEXT,
  device_id TEXT,
  notes TEXT,
  schema_version INTEGER NOT NULL
);
CREATE INDEX idx_sessions_started_at ON sessions(started_at);

CREATE TABLE sets (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  set_number INTEGER NOT NULL,
  load_kg REAL,
  load_type TEXT,
  schema_version INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX idx_sets_session_id ON sets(session_id);

CREATE TABLE reps (
  id TEXT PRIMARY KEY NOT NULL,
  set_id TEXT NOT NULL,
  rep_number INTEGER NOT NULL,
  raw_samples_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  FOREIGN KEY (set_id) REFERENCES sets(id) ON DELETE CASCADE
);
CREATE INDEX idx_reps_set_id ON reps(set_id);
```

### Migration runner

Source: `src/store/migration-runner.ts`. Class `MigrationRunner(driver: MigrationDriver)`.

Run order in `MigrationRunner.run(migrations)` (`:120-150`):

1. **Validate sequence** (`:70-82`) — must be contiguous `1..N`, sorted ascending. Rejection happens BEFORE any DDL.
2. **Bootstrap** (`:93-101`) — idempotent `CREATE TABLE IF NOT EXISTS __migrations`. DDL failure → `MigrationError('failed to create __migrations table', { cause })`.
3. **Read applied versions** from `__migrations`.
4. **For each unapplied** migration: verify SHA-256 (`createHash('sha256')` over the SQL string); on mismatch throw `MigrationError('hash mismatch for migration N: expected X, got Y')`. Apply SQL inside `withTransaction`, then `INSERT INTO __migrations (version, sha256)`.

Bootstrap table:

```sql
CREATE TABLE IF NOT EXISTS __migrations (
  version INTEGER PRIMARY KEY,
  sha256 TEXT NOT NULL,
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Drivers implement the `MigrationDriver` interface (`src/store/migration-runner.ts:39-53`) — intersection of `MigrationDriverSql` (`exec`, `selectAll`, `run`) and `TransactionalDriver`.

### `latestAppliedVersion` derivation

Both factories compute `latestAppliedVersion = Math.max(...(await runner.getAppliedVersions()))` immediately after `runner.run(MIGRATIONS)`. This becomes the `schemaVersion` written to all subsequent records via `prepareForSave`.

## Connection PRAGMAs

Source: `src/store/bootstrap.ts:30-38`.

`applyConnectionPragmas(driver)` issues, in order:

1. `PRAGMA foreign_keys = ON` — required for the `ON DELETE CASCADE` clauses to fire. SQLite default is OFF, per-connection.
2. `PRAGMA journal_mode = WAL`.
3. Reads back `PRAGMA journal_mode` and verifies the result is literally `'wal'`. If not (e.g. file is on a network filesystem that doesn't support memory-mapped I/O), throws `StoreError('failed to enable WAL: <actual>')`.

`PragmaDriver` interface at `:25-28`: minimal `{ exec, selectAll }` — both drivers satisfy this.

## Transaction shim: `withTransaction`

Source: `src/store/with-transaction.ts`. Discriminates between two driver shapes by literal `'transaction' in driver` (`:32-34`).

### Sync shape (`SyncTransactionalDriver`)

```ts
interface SyncTransactionalDriver {
  transaction<T>(fn: () => T): () => T;
}
```

Used by `BetterSqlite3Driver`. The wrapper returned by `transaction(fn)` runs BEGIN/body/COMMIT (or ROLLBACK) when invoked.

### Async shape (`AsyncTransactionalDriver`)

```ts
interface AsyncTransactionalDriver {
  beginExclusive(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
```

Used by `ExpoSqliteDriver`. `withTransaction` calls `beginExclusive` → `fn()` → `commit` (or `rollback` on throw).

### Important: `BetterSqlite3Driver` deviation

`better-sqlite3`'s native `db.transaction(fn)` rejects async `fn` ("Transaction function cannot return a promise"). The driver issues `BEGIN`/`COMMIT`/`ROLLBACK` manually via `db.exec` and serializes overlapping `withTransaction` calls with an internal Promise mutex (`this.chain`, `src/store/sqlite-node/driver.ts:88-110`). The DB ops themselves stay synchronous; the mutex prevents overlapping `BEGIN` from concurrent JS callers.

## Errors

Source: `src/store/errors.ts:12-31`. Three classes; each accepts `{ cause }`.

| Class | When |
| --- | --- |
| `StoreError` | Operational store failures: duplicate id, store closed, invalid limit, failed to open database, failed to enable WAL. |
| `MigrationError` | Migration sequence invalid, bootstrap DDL failure, SHA-256 hash mismatch. |
| `ValidationError` | zod validation failure, corrupt `rawSamplesJson` on read. |

There is **no** `NotFoundError` (D16 / AC-15). Reads return `undefined`/`[]` for missing rows by design.

## Drivers

### Node — `createSqliteNodeStore`

Source: `src/store/sqlite-node/index.ts:141-300`.

Open path:

1. Resolve `better-sqlite3` peer (default: `createRequire(import.meta.url)`-backed resolver, AC-22). Override via `options.resolver` for tests (AC-23 / v3-FIX-1).
2. `new Database(path)` — wraps native errors as `StoreError('failed to open database: <reason>', { cause })`.
3. Construct `BetterSqlite3Driver(db)`.
4. `applyConnectionPragmas(driver)`.
5. `runner.run(MIGRATIONS)`.
6. `latestAppliedVersion = Math.max(...await runner.getAppliedVersions())`.
7. Return `SessionStore` impl that closes over driver + version.

`saveReps([])` short-circuits before opening any transaction (`:222-223`).

`close()` is idempotent (`:284-288`).

`isUniqueConstraintError` (`:117-125`) detects `SQLITE_CONSTRAINT*` codes / messages.

### Expo / React Native — `createSqliteExpoStore`

Source: `src/store/sqlite-expo/index.ts:122-282`.

Mirrors the Node factory but async-throughout via `expo-sqlite`'s `openDatabaseAsync`, `execAsync`, `runAsync`, `getAllAsync`, `closeAsync`.

`ExpoSqliteDriver` (`src/store/sqlite-expo/driver.ts`):
- Implements `MigrationDriverSql` + `AsyncTransactionalDriver`.
- Holds an internal Promise mutex (`currentTx`) — new callers chain after the in-flight transaction's `commit()`/`rollback()` resolves before issuing their own `BEGIN EXCLUSIVE`. This is required because the async API does not have native serialization equivalent to `better-sqlite3`'s synchronous engine lock.
- `normalizeParams` (`:31-34`) maps `undefined` to `null` because `SQLiteBindValue` does not include `undefined`.

### Verification model

The Expo driver is verified at build time (TypeScript resolves types from `expo-sqlite/package.json#exports`) and via the shared store conformance suite when running on Expo SDK 54+ targets. Plain Node CI cannot import `expo-sqlite` (native module), so `runStoreTests` skips at runtime. Functional verification on devices and simulators is owned by `voltras/mobile`'s integration tests. Reference: `../../README.md` "Verification" section and `../../CHANGELOG.md` 1.1.0 notes.

## Wiring up a store (consumer flow)

Examples are user-facing in `../../README.md` "Node usage" / "Expo / React Native usage". Reproduced in skeleton form for context:

```ts
import { createSqliteNodeStore } from '@voltras/workout-analytics/store/sqlite-node';
const store = await createSqliteNodeStore({ path: './app.sqlite' });

await store.saveSession({ id: 's1', startedAt: Date.now(), schemaVersion: 1 });
await store.saveSet({ id: 'set1', sessionId: 's1', setNumber: 1, schemaVersion: 1 });
await store.saveReps([
  { id: 'rep1', setId: 'set1', repNumber: 1, rawSamplesJson: '{...}', schemaVersion: 1 },
]);

const recent = await store.getRecent(10);
await store.close();
```

The `schemaVersion: 1` passed in is overwritten by the store with `latestAppliedVersion` — pass any number.

`rawSamplesJson` is the consumer's responsibility to construct from a `Rep`'s phases. The package does not provide a serialization helper for this today.

## Test harness

`src/store/store.shared.ts` exports `runStoreTests`, a vitest conformance suite consumed by both driver test files (`src/__tests__/store/sqlite-node.test.ts`, `src/__tests__/store/sqlite-expo.test.ts`). The shared file is intentionally NOT re-exported from `src/store/index.ts` — it imports `vitest` and is only consumed by driver test files. Driver tests import via relative path `../../store/store.shared.js`.

The Expo test file uses runtime detection to skip when the native module is unavailable (plain Node CI).
