/**
 * BaselineKey Tests
 *
 * Identity of a calibration baseline: (user, exercise, setup, side).
 */

import { describe, it, expect } from 'vitest';
import { baselineKeyId, matchesBaselineKey, baselineKeyEquals } from '@/models/baseline-key';
import type { BaselineKey } from '@/models/baseline-key';

function makeKey(overrides: Partial<BaselineKey> = {}): BaselineKey {
  return { userId: 'u1', exerciseId: 'bench-press', ...overrides };
}

describe('baselineKeyId', () => {
  it('serializes omitted dimensions as wildcards', () => {
    expect(baselineKeyId(makeKey())).toBe('u1|bench-press|*|*');
  });

  it('includes setup and side when present', () => {
    expect(baselineKeyId(makeKey({ setupId: 'bench-low', side: 'left' }))).toBe(
      'u1|bench-press|bench-low|left'
    );
  });

  it('distinguishes the two sides of the same lift', () => {
    const left = baselineKeyId(makeKey({ side: 'left' }));
    const right = baselineKeyId(makeKey({ side: 'right' }));

    expect(left).not.toBe(right);
  });

  it('does not collide when an id contains the delimiter', () => {
    const withDelimiter = baselineKeyId({ userId: 'u1|bench-press', exerciseId: 'x' });
    const plain = baselineKeyId({ userId: 'u1', exerciseId: 'bench-press' });

    expect(withDelimiter).not.toBe(plain);
  });

  it('does not confuse a literal asterisk with an omitted dimension', () => {
    const literal = baselineKeyId(makeKey({ setupId: '*' }));
    const omitted = baselineKeyId(makeKey());

    expect(literal).not.toBe(omitted);
  });

  it('rejects an id that is not well-formed UTF-16, naming the offending field', () => {
    // A lone high surrogate — `encodeURIComponent` raises URIError on this.
    const bad = makeKey({ setupId: '\uD800' });

    expect(() => baselineKeyId(bad)).toThrow(TypeError);
    expect(() => baselineKeyId(bad)).toThrow(/BaselineKey\.setupId/);
  });
});

describe('matchesBaselineKey', () => {
  it('treats an empty filter as matching everything', () => {
    expect(matchesBaselineKey(makeKey({ side: 'right' }), {})).toBe(true);
  });

  it('matches every setup and side for a user when only userId is filtered', () => {
    const filter = { userId: 'u1' };

    expect(matchesBaselineKey(makeKey({ setupId: 'a', side: 'left' }), filter)).toBe(true);
    expect(matchesBaselineKey(makeKey({ setupId: 'b', side: 'right' }), filter)).toBe(true);
  });

  it('rejects a different user', () => {
    expect(matchesBaselineKey(makeKey(), { userId: 'u2' })).toBe(false);
  });

  it('selects a single side of a bilateral lift', () => {
    expect(matchesBaselineKey(makeKey({ side: 'left' }), { side: 'left' })).toBe(true);
    expect(matchesBaselineKey(makeKey({ side: 'right' }), { side: 'left' })).toBe(false);
  });

  it('requires every present filter field to match', () => {
    const key = makeKey({ setupId: 'bench-low', side: 'left' });

    expect(matchesBaselineKey(key, { userId: 'u1', setupId: 'bench-low' })).toBe(true);
    expect(matchesBaselineKey(key, { userId: 'u1', setupId: 'bench-high' })).toBe(false);
  });

  // The wildcard rule is filter-side ONLY. A key that omits a dimension is not
  // "pooled into" a filter that names it — a pooled baseline cannot vouch for a
  // specific setup, so a setup-specific query must exclude it.
  it('does not match a key lacking a dimension the filter names', () => {
    const pooled = makeKey(); // no setupId, no side

    expect(matchesBaselineKey(pooled, { setupId: 'bench-low' })).toBe(false);
    expect(matchesBaselineKey(pooled, { side: 'left' })).toBe(false);
    expect(matchesBaselineKey(pooled, { userId: 'u1' })).toBe(true);
  });
});

describe('baselineKeyEquals', () => {
  it('is true for identical keys regardless of field order', () => {
    const a: BaselineKey = { userId: 'u1', exerciseId: 'row', side: 'left' };
    const b: BaselineKey = { side: 'left', exerciseId: 'row', userId: 'u1' };

    expect(baselineKeyEquals(a, b)).toBe(true);
  });

  it('is false when one key carries a side and the other does not', () => {
    expect(baselineKeyEquals(makeKey({ side: 'left' }), makeKey())).toBe(false);
  });

  // Each dimension independently, so an implementation that compares only
  // `side` (or only one other field) cannot pass.
  it('is false when the userId differs', () => {
    expect(
      baselineKeyEquals(makeKey({ side: 'left' }), { ...makeKey({ side: 'left' }), userId: 'u2' })
    ).toBe(false);
  });

  it('is false when the exerciseId differs', () => {
    expect(baselineKeyEquals(makeKey(), { ...makeKey(), exerciseId: 'squat' })).toBe(false);
  });

  it('is false when the setupId differs', () => {
    expect(
      baselineKeyEquals(makeKey({ setupId: 'bench-low' }), makeKey({ setupId: 'bench-high' }))
    ).toBe(false);
  });

  it('is false when the side differs', () => {
    expect(baselineKeyEquals(makeKey({ side: 'left' }), makeKey({ side: 'right' }))).toBe(false);
  });
});
