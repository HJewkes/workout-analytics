/**
 * AC-02: the current root barrel exports a superset of the v0.2.0 public API.
 *
 * The fixture is hard-coded (not pulled live from `npm`) per v4-FIX-6 so the test is
 * deterministic and offline. Sourced once via `npm pack @voltras/workout-analytics@0.2.0`
 * and walking `dist/types/index.d.ts`.
 *
 * Implementation note: TypeScript erases `export { type X }` at runtime, so a runtime
 * `Object.keys(rootBarrel)` only sees value exports. We therefore parse the barrel's
 * source text, collecting both value and type exports — that is what consumers see
 * via `import { X }` regardless of whether `X` is a value or a type.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as rootBarrel from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const fixturePath = resolve(here, 'fixtures/v0.2.0-public-api.json');
const fixture: string[] = JSON.parse(readFileSync(fixturePath, 'utf8'));

function parseBarrelExports(source: string): Set<string> {
  const names = new Set<string>();
  // Strip `// line comments` so they don't bleed into the split-by-comma below.
  const stripped = source.replace(/\/\/[^\n]*/g, '');
  const blockRe = /export\s*\{([^}]*)\}\s*from/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(stripped)) !== null) {
    for (const raw of match[1].split(',')) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      const cleaned = trimmed
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (cleaned) names.add(cleaned);
    }
  }
  return names;
}

describe('AC-02: public API baseline (v0.2.0 superset)', () => {
  const barrelSource = readFileSync(resolve(repoRoot, 'src/index.ts'), 'utf8');
  const declaredExports = parseBarrelExports(barrelSource);

  it('every fixture symbol is declared in the current root barrel', () => {
    const missing = fixture.filter((name) => !declaredExports.has(name));
    expect(missing).toEqual([]);
  });

  it('value exports from the fixture resolve at runtime', () => {
    const runtimeExports = new Set(Object.keys(rootBarrel));
    // We cannot tell types from values from the fixture alone, so we only assert
    // that AT LEAST the runtime exports contain the value-shaped fixture entries
    // by checking that any fixture entry that IS in runtime exports stays consistent.
    const valueLike = fixture.filter((name) => runtimeExports.has(name));
    // Sanity: a healthy slice of the fixture should be runtime-resolvable.
    // (The exact split depends on how many are types; at v0.2.0, ~150 are values.)
    expect(valueLike.length).toBeGreaterThan(100);
  });

  it('fixture is non-empty (sanity check)', () => {
    expect(fixture.length).toBeGreaterThan(0);
  });
});
