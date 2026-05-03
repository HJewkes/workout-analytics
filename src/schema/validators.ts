/**
 * Zod validators for schema records.
 *
 * D19 invariant: NO `.default()`, `.transform()`, or `.coerce` anywhere. The store's
 * round-trip contract (D11) requires that validation does not silently mutate input
 * shape. `validators.test.ts` walks each schema's `_def` and asserts no `ZodEffects`
 * nodes and no `coerce` flags.
 */

import { z } from 'zod';
import type { RepRecord, SetRecord, Session } from './types.js';

export const sessionSchema: z.ZodType<Session> = z.object({
  id: z.string(),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  exerciseId: z.string().optional(),
  deviceId: z.string().optional(),
  notes: z.string().optional(),
  schemaVersion: z.number(),
});

export const setRecordSchema: z.ZodType<SetRecord> = z.object({
  id: z.string(),
  sessionId: z.string(),
  setNumber: z.number(),
  loadKg: z.number().optional(),
  loadType: z.enum(['absolute', 'percent1RM']).optional(),
  schemaVersion: z.number(),
});

export const repRecordSchema: z.ZodType<RepRecord> = z.object({
  id: z.string(),
  setId: z.string(),
  repNumber: z.number(),
  rawSamplesJson: z.string(),
  schemaVersion: z.number(),
});
