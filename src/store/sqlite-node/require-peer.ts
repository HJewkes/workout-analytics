/**
 * `createRequirePeerResolver` — single ESM code path to resolve an optional
 * peer-dependency package via Node's `createRequire`.
 *
 * The package is published as ESM-only (D-ESM) and `better-sqlite3` is
 * CommonJS, so we resolve it via `createRequire(import.meta.url)` rather than
 * through a dynamic `import()`. There is intentionally NO CJS-detection
 * fallback branch (D13 / AC-24): a `require` global never appears in modern
 * ESM, so any such fallback would be dead code that confuses bundlers (and
 * AC-24 requires its absence).
 *
 * The resolver is exposed as an injectable function so tests can pass a stub
 * (AC-23 / v3-FIX-1).
 */

import { createRequire } from 'node:module';

export type PeerResolver = (name: string) => unknown;

export function createRequirePeerResolver(): PeerResolver {
  const requireFn = createRequire(import.meta.url);
  return (name: string) => requireFn(name);
}
