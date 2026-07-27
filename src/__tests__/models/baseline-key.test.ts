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
});
