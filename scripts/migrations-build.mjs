#!/usr/bin/env node
/**
 * Generate `src/schema/_generated.ts` from the SQL migration files.
 *
 * Every `NNN_name.sql` under `src/schema/migrations/` is read as a Buffer (no
 * decoding — v5R-10) so the SHA-256 is platform-stable regardless of git's EOL
 * handling, then emitted as a `<NAME>_SQL` / `<NAME>_SHA256` pair where `<NAME>`
 * is the filename with its numeric prefix stripped and upper-cased
 * (`001_initial.sql` → `INITIAL`). The registry in
 * `src/schema/migrations/index.ts` stays hand-written so the version ordering is
 * reviewed rather than inferred from a directory listing.
 *
 * CI runs this and `git diff --exit-code` to detect drift (AC-29).
 *
 * The emitted source is run through Prettier with the repo's own config before
 * writing, so `format:check` is clean immediately after a build by construction.
 * Hand-shaping the output to guess Prettier's preferences does not survive
 * contact with real SQL: an apostrophe anywhere in the file flips Prettier's
 * preferred quote character, and a longer export name pushes the SHA constant
 * past the print width onto its own line.
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const migrationsDir = resolve(repoRoot, 'src/schema/migrations');
const outPath = resolve(repoRoot, 'src/schema/_generated.ts');

/** `001_initial.sql` → `INITIAL`; `002_position_metres.sql` → `POSITION_METRES`. */
function exportPrefix(filename) {
  return filename
    .replace(/^\d+_/, '')
    .replace(/\.sql$/, '')
    .toUpperCase();
}

const sqlFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const blocks = [];
const summary = [];

for (const filename of sqlFiles) {
  const buffer = readFileSync(resolve(migrationsDir, filename));
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  const prefix = exportPrefix(filename);

  blocks.push(
    `export const ${prefix}_SQL = ${JSON.stringify(buffer.toString('utf8'))};\n\n` +
      `export const ${prefix}_SHA256 = ${JSON.stringify(sha256)};\n`,
  );
  summary.push(`${filename}=${sha256.slice(0, 16)}...`);
}

const generated = `/**
 * AUTO-GENERATED FILE — DO NOT EDIT.
 *
 * Regenerate via \`npm run migrations:build\` (which runs scripts/migrations-build.mjs).
 * CI verifies this file is in sync with the SQL source via \`git diff --exit-code\`
 * after running the build script (AC-29).
 *
 * Each SHA-256 is computed over the raw \`.sql\` Buffer (no decoding) so it is stable
 * across platforms (v5R-10 / AC-37). \`.gitattributes\` enforces \`*.sql -text\` to
 * prevent git from normalizing line endings on the source.
 */

${blocks.join('\n')}`;

const prettierConfig = await prettier.resolveConfig(outPath);
const formatted = await prettier.format(generated, {
  ...prettierConfig,
  filepath: outPath,
  parser: 'typescript',
});

writeFileSync(outPath, formatted);

process.stdout.write(`migrations:build → wrote ${outPath} (${summary.join(', ')})\n`);
