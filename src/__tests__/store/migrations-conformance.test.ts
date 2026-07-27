/**
 * AC-28 conformance: every SHA-256 in the auto-generated module matches the
 * SHA-256 of the corresponding raw SQL file's bytes (no decoding — v5R-10 /
 * AC-37).
 *
 * The build script (`scripts/migrations-build.mjs`) reads each SQL file as a
 * Buffer and hashes the Buffer directly. This test reproduces those hashes from
 * the SQL files at test time and asserts the persisted constants match.
 *
 * `.gitattributes` enforces `*.sql -text` so git doesn't normalize line
 * endings — together with the no-decode hash, that guarantees the SHA is
 * platform-stable.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INITIAL_SHA256, POSITION_METRES_SHA256 } from '@/schema/_generated';
import { MIGRATIONS } from '@/schema/migrations/index';

const here = dirname(fileURLToPath(import.meta.url));
// src/__tests__/store -> src/schema/migrations/
const migrationsDir = resolve(here, '../../schema/migrations');

function sha256OfFile(filename: string): string {
  return createHash('sha256')
    .update(readFileSync(resolve(migrationsDir, filename)))
    .digest('hex');
}

describe('migrations conformance (AC-28)', () => {
  it.each([
    ['001_initial.sql', INITIAL_SHA256],
    ['002_position_metres.sql', POSITION_METRES_SHA256],
  ])('%s hash matches the generated constant', (filename, declared) => {
    expect(declared).toBe(sha256OfFile(filename));
  });

  it('registers every SQL file, contiguous from version 1', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2]);
  });

  it('version 2 is the position-scale boundary marker and rewrites no rows', () => {
    const v2 = MIGRATIONS.find((m) => m.version === 2);

    // A marker, not a data migration: no UPDATE/DELETE/DROP of existing data.
    expect(v2?.sql).toMatch(/PRAGMA user_version = 2;/);
    expect(v2?.sql).not.toMatch(/\b(UPDATE|DELETE|DROP|ALTER)\b/i);
  });
});
