/**
 * Shared Utilities for Collection Scripts
 *
 * File I/O, HTTP helpers, and common utilities used across scripts.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// =============================================================================
// File I/O
// =============================================================================

function getScriptDir(): string {
  try {
    return dirname(fileURLToPath(import.meta.url));
  } catch {
    return __dirname;
  }
}

const DATA_ROOT = resolve(getScriptDir(), '..', '..', 'data');

export function dataPath(...segments: string[]): string {
  return join(DATA_ROOT, ...segments);
}

export async function readJSON<T>(path: string): Promise<T> {
  const content = await readFile(path, 'utf-8');
  return JSON.parse(content) as T;
}

export async function writeJSON(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function dataExists(path: string): boolean {
  return existsSync(path);
}

// =============================================================================
// HTTP Helpers
// =============================================================================

export interface FetchOptions {
  /** Base URL for API requests */
  baseUrl: string;
  /** Request headers */
  headers?: Record<string, string>;
  /** Delay between paginated requests (ms) */
  rateLimit?: number;
}

/**
 * Fetch JSON from a URL with error handling and optional rate limiting.
 */
export async function fetchJSON<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${url}`);
  }

  return (await response.json()) as T;
}

/**
 * Fetch all pages from a paginated API.
 */
export async function fetchAllPages<T>(
  baseUrl: string,
  params: Record<string, string> = {},
  options: { rateLimit?: number; headers?: Record<string, string> } = {},
): Promise<T[]> {
  const results: T[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const searchParams = new URLSearchParams({
      ...params,
      format: 'json',
      limit: String(limit),
      offset: String(offset),
    });

    const url = `${baseUrl}?${searchParams}`;
    const response = await fetchJSON<{ count: number; next: string | null; results: T[] }>(
      url,
      options.headers,
    );

    results.push(...response.results);

    if (!response.next || results.length >= response.count) {
      break;
    }

    offset += limit;

    if (options.rateLimit) {
      await sleep(options.rateLimit);
    }
  }

  return results;
}

// =============================================================================
// String Utilities
// =============================================================================

/**
 * Convert a string to a slug ID (e.g., "Bench Press" → "bench_press").
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Normalize a string for fuzzy comparison.
 */
export function normalizeForComparison(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// =============================================================================
// Logging
// =============================================================================

export function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

export function logSection(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}\n`);
}

export function logTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)),
  );

  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');

  console.log(headerLine);
  console.log(separator);
  for (const row of rows) {
    console.log(row.map((cell, i) => (cell ?? '').padEnd(widths[i])).join('  '));
  }
}

// =============================================================================
// Misc
// =============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return groups;
}

export function countBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function sortByDescending<T>(arr: T[], valueFn: (item: T) => number): T[] {
  return [...arr].sort((a, b) => valueFn(b) - valueFn(a));
}
