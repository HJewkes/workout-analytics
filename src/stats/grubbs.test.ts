/**
 * Grubbs / Student's t tests.
 *
 * Both functions are verified against published tables rather than against
 * themselves: the t tail against two-sided t critical values, and
 * `grubbsCriticalValue` against the two-sided Grubbs table in NIST/SEMATECH
 * §1.3.5.17. Nothing here asserts a number this repo invented.
 */

import { describe, it, expect } from 'vitest';
import {
  GRUBBS_DEFAULT_ALPHA,
  grubbsCriticalValue,
  isGrubbsOutlier,
  maxAbsZScore,
  studentTTwoSidedTail,
} from '@/stats/grubbs';

describe('studentTTwoSidedTail()', () => {
  // Published two-sided t critical values: [t, degrees of freedom, tail].
  const TABLE: Array<[number, number, number]> = [
    [12.706, 1, 0.05],
    [4.303, 2, 0.05],
    [3.182, 3, 0.05],
    [2.776, 4, 0.05],
    [2.228, 10, 0.05],
    [2.086, 20, 0.05],
    [63.657, 1, 0.01],
    [5.841, 3, 0.01],
    [3.169, 10, 0.01],
  ];

  it.each(TABLE)('t=%f on %i d.f. has two-sided tail %f', (t, nu, tail) => {
    expect(studentTTwoSidedTail(t, nu)).toBeCloseTo(tail, 4);
  });

  it('is 1 at t=0 and 0 in the limit', () => {
    expect(studentTTwoSidedTail(0, 5)).toBeCloseTo(1, 10);
    expect(studentTTwoSidedTail(Infinity, 5)).toBe(0);
  });

  it('decreases monotonically in t', () => {
    const tails = [0.5, 1, 2, 4, 8].map((t) => studentTTwoSidedTail(t, 7));
    for (let i = 1; i < tails.length; i++) {
      expect(tails[i]).toBeLessThan(tails[i - 1]);
    }
  });
});

describe('maxAbsZScore()', () => {
  // Samuelson's inequality with Bessel's correction, verified empirically in
  // KNOWN-ISSUES-2026-07-27.md:96-104.
  it.each([
    [3, 1.1547],
    [4, 1.5],
    [5, 1.7889],
    [6, 2.0412],
  ])('bounds |z| at %f reps to %f', (n, bound) => {
    expect(maxAbsZScore(n)).toBeCloseTo(bound, 4);
  });

  it('is 0 below two samples', () => {
    expect(maxAbsZScore(1)).toBe(0);
    expect(maxAbsZScore(0)).toBe(0);
  });
});

describe('grubbsCriticalValue()', () => {
  // Two-sided Grubbs critical values, NIST/SEMATECH e-Handbook §1.3.5.17.
  const ALPHA_05: Array<[number, number]> = [
    [3, 1.1543],
    [4, 1.4812],
    [5, 1.715],
    [6, 1.8871],
    [7, 2.02],
    [8, 2.1266],
    [10, 2.29],
    [20, 2.7082],
    [30, 2.9085],
  ];

  it.each(ALPHA_05)('matches the alpha=0.05 table at n=%i (%f)', (n, expected) => {
    expect(grubbsCriticalValue(n, 0.05)).toBeCloseTo(expected, 3);
  });

  const ALPHA_01: Array<[number, number]> = [
    [4, 1.4962],
    [5, 1.7637],
    [6, 1.9728],
    [10, 2.482],
  ];

  it.each(ALPHA_01)('matches the alpha=0.01 table at n=%i (%f)', (n, expected) => {
    expect(grubbsCriticalValue(n, 0.01)).toBeCloseTo(expected, 3);
  });

  it('stays strictly below the Samuelson bound, so the test is reachable', () => {
    for (const n of [3, 4, 5, 6, 8, 12, 20]) {
      expect(grubbsCriticalValue(n)).toBeLessThan(maxAbsZScore(n));
    }
  });

  it('is undefined below three samples', () => {
    expect(grubbsCriticalValue(2)).toBe(Infinity);
    expect(grubbsCriticalValue(1)).toBe(Infinity);
  });

  it('rises as alpha tightens', () => {
    expect(grubbsCriticalValue(10, 0.01)).toBeGreaterThan(grubbsCriticalValue(10, 0.05));
  });

  it('defaults to alpha 0.05', () => {
    expect(GRUBBS_DEFAULT_ALPHA).toBe(0.05);
    expect(grubbsCriticalValue(10)).toBe(grubbsCriticalValue(10, 0.05));
  });
});

describe('isGrubbsOutlier() boundary', () => {
  // Grubbs rejects on G > G_crit, so equality is NOT an outlier. Passing the
  // critical value itself is the only way to land on the boundary exactly:
  // it comes out of a bisection, so no set of reps produces a z-score equal
  // to it in floating point. A `>` / `>=` slip is invisible without this.
  const REP_COUNTS = [3, 5, 6, 10, 20];

  it.each(REP_COUNTS)('is false exactly AT the critical value for n=%i', (n) => {
    expect(isGrubbsOutlier(grubbsCriticalValue(n), n)).toBe(false);
  });

  it.each(REP_COUNTS)('is true just above the critical value for n=%i', (n) => {
    const critical = grubbsCriticalValue(n);
    expect(isGrubbsOutlier(critical * (1 + 1e-12), n)).toBe(true);
  });

  it.each(REP_COUNTS)('is false just below the critical value for n=%i', (n) => {
    const critical = grubbsCriticalValue(n);
    expect(isGrubbsOutlier(critical * (1 - 1e-12), n)).toBe(false);
  });

  it('holds the boundary at a non-default alpha too', () => {
    expect(isGrubbsOutlier(grubbsCriticalValue(8, 0.01), 8, 0.01)).toBe(false);
    expect(isGrubbsOutlier(grubbsCriticalValue(8, 0.01) * (1 + 1e-12), 8, 0.01)).toBe(true);
  });

  it('is false below three samples, where the test is undefined', () => {
    expect(isGrubbsOutlier(1e6, 2)).toBe(false);
  });
});
