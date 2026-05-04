/**
 * `prepareForSave` — validate, defensively shallow-copy, then overwrite
 * `schemaVersion` with the store's `latestAppliedVersion` (D2 / AC-05 /
 * v5R-12).
 *
 * Why shallow rather than `structuredClone`: records are flat objects of
 * primitives (strings, numbers, undefined). `rawSamplesJson` is an opaque
 * string per v5R-4 — there are no nested mutables to copy. Shallow spread is
 * portable across Hermes versions and avoids the runtime cost.
 *
 * `prepareForSave` MUST NOT mutate `input` (D2). The shallow spread plus
 * direct field assignment to the new object preserves that.
 *
 * Validation failure (`ZodError`) is wrapped as
 * `ValidationError(message, { cause: zodError })` so callers don't depend on
 * zod-specific error shapes.
 */

import type { z } from 'zod';
import { ValidationError } from './errors.js';

export function prepareForSave<T extends { schemaVersion: number }>(
  validator: z.ZodType<T>,
  input: T,
  latestAppliedVersion: number
): T {
  let parsed: T;
  try {
    parsed = validator.parse(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'validation failed';
    throw new ValidationError(message, { cause: err });
  }
  // Shallow defensive copy (v5R-12), then overwrite schemaVersion (D2).
  // Records are flat — strings, numbers, undefined — so shallow is enough.
  return { ...parsed, schemaVersion: latestAppliedVersion };
}
