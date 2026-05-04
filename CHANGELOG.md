# Changelog

All notable changes to `@voltras/workout-analytics` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0

### Breaking

- **ESM-only.** The CJS dual-emit build has been dropped. `package.json#type` is now `"module"`; only `dist/esm/` and `dist/types/` ship. Consumers on CJS must use `await import('@voltras/workout-analytics')` or migrate to ESM.

### Added

- New subpath exports for the storage layer separation:
  - `@voltras/workout-analytics/schema` — schema types and validators (zod-backed).
  - `@voltras/workout-analytics/store` — `SessionStore` interface, `StoreError`, in-memory store.
  - `@voltras/workout-analytics/store/sqlite-node` — Node SQLite driver, backed by `better-sqlite3`.
- `peerDependencies`: `better-sqlite3@^11` and `expo-sqlite@^15`, both flagged `optional: true` via `peerDependenciesMeta`. Consumers install only the driver they need.
- `zod` added as a runtime dependency.

### Notes

- `@voltras/workout-analytics/store/sqlite-expo` is **not** shipped in 1.0.0; it follows in 1.1.x once the Expo driver source lands.
