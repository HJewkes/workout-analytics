#!/usr/bin/env node
// Packs the library, installs the tarball into a copy of tests/nodenext-consumer,
// and type-checks it with moduleResolution NodeNext (VW-564). Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const scratch = mkdtempSync(join(tmpdir(), 'wa-nodenext-'));
try {
  cpSync(join(root, 'tests/nodenext-consumer'), scratch, { recursive: true });
  const packed = execFileSync(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', scratch],
    { cwd: root }
  );
  const [{ filename: tarball }] = JSON.parse(packed.toString());
  writeFileSync(
    join(scratch, 'package.json'),
    JSON.stringify({ name: 'wa-nodenext-consumer', private: true, type: 'module' })
  );
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', join(scratch, tarball)], {
    cwd: scratch,
  });
  const tsc = join(root, 'node_modules/typescript/bin/tsc');
  execFileSync('node', [tsc, '-p', join(scratch, 'tsconfig.json')], {
    cwd: scratch,
    stdio: 'inherit',
  });
  console.log('types ok: the packed declarations type-check under NodeNext');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
