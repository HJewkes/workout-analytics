#!/usr/bin/env node
// Fails when a doc cites source by line number (`file.ts:12-34`,
// `package.json:9`, a bare `:12-34` or `:36+`, `#L12`, `(L12)`, or prose such
// as "lines 12-34"). Line ranges go stale on every edit and send reviewers to
// the wrong code; cite the file plus the function, type, constant or field
// name instead.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docsDir = join(root, 'docs');
const generatedDirs = new Set([join(docsDir, 'api')]);
const LINE_CITATION = /\.(?:ts|tsx|js|mjs|cjs|json|sql|md)`?:\d+|`:\d+|#L\d+|\(L\d+|\blines? \d+/i;

function listMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return generatedDirs.has(path) ? [] : listMarkdown(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

const hits = listMarkdown(docsDir).flatMap((file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) => (LINE_CITATION.test(line) ? [`${relative(root, file)}:${index + 1}: ${line.trim()}`] : [])),
);

if (hits.length > 0) {
  console.error(`Line-number source citations found in docs (cite file and function name instead):\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('docs: no line-number source citations');
