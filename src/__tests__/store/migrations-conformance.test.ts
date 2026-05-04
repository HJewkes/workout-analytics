/**
 * AC-28 conformance: `INITIAL_SHA256` from the auto-generated module matches
 * the SHA-256 of the raw SQL file's bytes (no decoding — v5R-10 / AC-37).
 *
 * The build script (`scripts/migrations-build.mjs`) reads the SQL file as a
 * Buffer and hashes the Buffer directly. This test reproduces that hash from
 * the SQL file at test time and asserts the persisted constant matches.
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
import { INITIAL_SHA256 } from '@/schema/_generated';

const here = dirname(fileURLToPath(import.meta.url));
// src/__tests__/store -> src/schema/migrations/001_initial.sql
const sqlPath = resolve(here, '../../schema/migrations/001_initial.sql');

describe('migrations conformance (AC-28)', () => {
  it('INITIAL_SHA256 matches sha256 of 001_initial.sql buffer', () => {
    const buffer = readFileSync(sqlPath);
    const actual = createHash('sha256').update(buffer).digest('hex');
    expect(INITIAL_SHA256).toBe(actual);
  });
});
