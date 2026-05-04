/**
 * AC-04 / D19: validators forbid `.default()`, `.transform()`, and `.coerce`.
 *
 * Walks each schema's `_def` recursively and asserts no node has
 * `typeName === 'ZodEffects'`, no `coerce` flag, and no `defaultValue` wrapper.
 * Also covers happy-path validator behavior.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { repRecordSchema, setRecordSchema, sessionSchema } from '@/schema/validators';
import type { RepRecord, SetRecord, Session } from '@/schema/types';

interface ZodLike {
  readonly _def?: ZodDef;
  readonly typeName?: string;
}
interface ZodDef {
  readonly typeName?: string;
  readonly coerce?: boolean;
  readonly defaultValue?: unknown;
  readonly schema?: ZodLike;
  readonly type?: ZodLike;
  readonly innerType?: ZodLike;
  readonly options?: readonly ZodLike[];
  readonly shape?: () => Record<string, ZodLike>;
}

function walk(node: ZodLike | undefined, visit: (def: ZodDef) => void): void {
  if (!node || !node._def) return;
  const def = node._def;
  visit(def);
  if (def.schema) walk(def.schema, visit);
  if (def.type) walk(def.type, visit);
  if (def.innerType) walk(def.innerType, visit);
  if (def.options) {
    for (const opt of def.options) walk(opt, visit);
  }
  if (typeof def.shape === 'function') {
    const shape = def.shape();
    for (const child of Object.values(shape)) walk(child, visit);
  }
}

describe('AC-04 / D19: schemas forbid .default() / .transform() / .coerce', () => {
  const schemas: Array<readonly [string, z.ZodType<unknown>]> = [
    ['sessionSchema', sessionSchema],
    ['setRecordSchema', setRecordSchema],
    ['repRecordSchema', repRecordSchema],
  ];

  for (const [name, schema] of schemas) {
    it(`${name} contains no ZodEffects, .default(), or .coerce`, () => {
      const violations: string[] = [];
      walk(schema as unknown as ZodLike, (def) => {
        if (def.typeName === 'ZodEffects') violations.push('ZodEffects');
        if (def.typeName === 'ZodDefault') violations.push('ZodDefault');
        if (def.coerce === true) violations.push('coerce flag');
      });
      expect(violations).toEqual([]);
    });
  }
});

describe('happy-path validator behavior', () => {
  it('sessionSchema.parse accepts a minimal valid session', () => {
    const input: Session = {
      id: 's1',
      startedAt: 1700000000000,
      schemaVersion: 1,
    };
    const out = sessionSchema.parse(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('sessionSchema.parse rejects missing required fields', () => {
    expect(() => sessionSchema.parse({ id: 's1', startedAt: 1 })).toThrow();
  });

  it('setRecordSchema.parse accepts both loadType values', () => {
    const a: SetRecord = {
      id: 'set1',
      sessionId: 's1',
      setNumber: 1,
      loadType: 'absolute',
      schemaVersion: 1,
    };
    const b: SetRecord = { ...a, id: 'set2', loadType: 'percent1RM' };
    expect(setRecordSchema.parse(a)).toEqual(a);
    expect(setRecordSchema.parse(b)).toEqual(b);
  });

  it('setRecordSchema.parse rejects unknown loadType values', () => {
    expect(() =>
      setRecordSchema.parse({
        id: 'set1',
        sessionId: 's1',
        setNumber: 1,
        loadType: 'bogus',
        schemaVersion: 1,
      })
    ).toThrow();
  });

  it('repRecordSchema.parse accepts an opaque rawSamplesJson string', () => {
    const input: RepRecord = {
      id: 'r1',
      setId: 'set1',
      repNumber: 1,
      rawSamplesJson: '{"concentric":[],"eccentric":[]}',
      schemaVersion: 1,
    };
    expect(repRecordSchema.parse(input)).toEqual(input);
  });

  it('repRecordSchema.parse rejects non-string rawSamplesJson (no coercion — D19)', () => {
    expect(() =>
      repRecordSchema.parse({
        id: 'r1',
        setId: 'set1',
        repNumber: 1,
        rawSamplesJson: 123 as unknown as string,
        schemaVersion: 1,
      })
    ).toThrow();
  });
});
