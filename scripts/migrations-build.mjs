#!/usr/bin/env node
/**
 * Generate `src/schema/_generated.ts` from the SQL migration files.
 *
 * Reads `001_initial.sql` as a Buffer (no decoding — v5R-10) so the SHA-256 is
 * platform-stable regardless of git's EOL handling, then writes the file with
 * deterministic content. CI runs this and `git diff --exit-code` to detect drift
 * (AC-29).
 *
 * Output is shaped to match Prettier's defaults (single quotes, semicolons,
 * 100-col print width) so `format:check` is clean immediately after a build.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const sqlPath = resolve(repoRoot, 'src/schema/migrations/001_initial.sql');
const outPath = resolve(repoRoot, 'src/schema/_generated.ts');

const sqlBuffer = readFileSync(sqlPath);
const sqlText = sqlBuffer.toString('utf8');
const sha256 = createHash('sha256').update(sqlBuffer).digest('hex');

/**
 * Render a JS string literal in prettier's preferred single-quote style.
 * We start from `JSON.stringify` (which handles all required escapes) and then
 * swap the outer double-quotes for single-quotes, escaping any literal single
 * quotes in the source. The SQL files we hash are unlikely to contain `'`, but
 * we handle it correctly regardless.
 */
function singleQuoteLiteral(value) {
  const json = JSON.stringify(value);
  // Strip outer double-quotes
  const inner = json.slice(1, -1);
  // Unescape \" (becomes "), then escape any ' as \'
  const swapped = inner.replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${swapped}'`;
}

const sqlLiteral = singleQuoteLiteral(sqlText);
const shaLiteral = singleQuoteLiteral(sha256);

const generated = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate via \`npm run migrations:build\` (which runs scripts/migrations-build.mjs).
 * CI verifies this file is in sync with the SQL source via \`git diff --exit-code\`
 * after running the build script (AC-29).
 *
 * The SHA-256 is computed over the raw \`001_initial.sql\` Buffer (no decoding) so it
 * is stable across platforms (v5R-10 / AC-37). \`.gitattributes\` enforces \`*.sql -text\`
 * to prevent git from normalizing line endings on the source.
 */

export const INITIAL_SQL =
  ${sqlLiteral};

export const INITIAL_SHA256 = ${shaLiteral};
`;

writeFileSync(outPath, generated);

process.stdout.write(
  `migrations:build → wrote ${outPath} (sha256=${sha256.slice(0, 16)}...)\n`,
);
