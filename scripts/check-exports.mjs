#!/usr/bin/env node
// Packs the library, installs the tarball into a scratch project, and imports
// the root, `/view`, and `/schema` doors the way a consumer would. Does not
// cover `/store`, `/store/sqlite-node`, or `/store/sqlite-expo` — the two
// drivers need optional peer deps (better-sqlite3, expo-sqlite) this scratch
// project doesn't install. Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const scratch = mkdtempSync(join(tmpdir(), 'wa-exports-'));
try {
  const tarball = execFileSync('npm', ['pack', '--silent', '--pack-destination', scratch], { cwd: root })
    .toString()
    .trim();
  writeFileSync(join(scratch, 'package.json'), JSON.stringify({ name: 'wa-consumer', private: true, type: 'module' }));
  execFileSync('npm', ['install', '--silent', '--no-audit', '--no-fund', join(scratch, tarball)], { cwd: scratch });
  writeFileSync(
    join(scratch, 'consumer.mjs'),
    [
      "import { estimateSetRpe, getSetTempoSeconds, classifyWeeklyVolume } from '@voltras/workout-analytics/view';",
      "import { getWeeklySummaries, getVolumeByMuscleGroup, buildTimeSeries, resolveSetEffort, EFFORT_POLICY } from '@voltras/workout-analytics';",
      "import { } from '@voltras/workout-analytics/schema';",
      'for (const [name, fn] of Object.entries({ estimateSetRpe, getSetTempoSeconds, classifyWeeklyVolume, getWeeklySummaries, getVolumeByMuscleGroup, buildTimeSeries, resolveSetEffort })) {',
      "  if (typeof fn !== 'function') throw new Error(`${name} is not exported as a function`);",
      '}',
      "if (typeof EFFORT_POLICY?.defaultEffortCapRpe !== 'number') throw new Error('EFFORT_POLICY is not exported');",
      "console.log('exports ok: ./view and root re-exports resolve from the packed tarball');",
    ].join('\n'),
  );
  execFileSync('node', ['consumer.mjs'], { cwd: scratch, stdio: 'inherit' });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
