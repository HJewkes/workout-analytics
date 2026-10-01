/**
 * VW-573: the exercise catalog must load from the PACKED package, not just from src.
 *
 * Builds, packs, installs the tarball into a scratch project, swaps in a synthetic
 * one-entry catalog, and calls `loadCatalog()` the way a consumer would. The package
 * ships ESM only, so there is no CJS leg.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SYNTHETIC_ID = 'synthetic-pack-test-exercise';
let scratch: string;

function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'wa-packed-catalog-'));
  run('npm', ['run', 'build', '--silent'], repoRoot);
  const tarball = run('npm', ['pack', '--silent', '--pack-destination', scratch], repoRoot);
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'wa-consumer', private: true, type: 'module' })
  );
  run('npm', ['install', '--silent', '--no-audit', '--no-fund', join(scratch, tarball)], scratch);
  const shipped = join(
    scratch,
    'node_modules/@voltras/workout-analytics/dist/esm/exercises/data/catalog.json'
  );
  writeFileSync(
    shipped,
    JSON.stringify([
      {
        id: SYNTHETIC_ID,
        name: 'Synthetic',
        muscleGroups: [],
        movementPattern: 'push',
        equipment: [],
      },
    ])
  );
}, 120_000);

afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

describe('packed package catalog', () => {
  it('loads the shipped catalog data through loadCatalog in an ESM consumer', () => {
    const script = [
      "import { loadCatalog, getExerciseById } from '@voltras/workout-analytics';",
      'const count = await loadCatalog();',
      `console.log(JSON.stringify({ count, id: getExerciseById('${SYNTHETIC_ID}')?.id ?? null }));`,
    ].join('\n');
    writeFileSync(join(scratch, 'consumer.mjs'), script);

    const result = JSON.parse(run('node', ['consumer.mjs'], scratch));

    expect(result).toEqual({ count: 1, id: SYNTHETIC_ID });
  }, 30_000);
});
