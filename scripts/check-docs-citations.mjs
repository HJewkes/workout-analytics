#!/usr/bin/env node
// Fails when a doc cites source by line number (`file.ts:12-34`, a bare
// `:12-34`, or `#L12`). Line ranges go stale on every edit and send reviewers
// to the wrong code; cite `file.ts` plus the function or type name instead.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const docsDir = join(root, 'docs');
const generatedDirs = new Set([join(docsDir, 'api')]);
const LINE_CITATION = /\.(?:ts|tsx|js|mjs|cjs):\d+|`:\d+(?:[-,]\d+)*`|#L\d+/;

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
