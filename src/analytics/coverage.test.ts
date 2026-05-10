/**
 * Coverage Tracking Tests — buildCoverageMap + detectStaleBins
 */

import { describe, it, expect } from 'vitest';
import { buildCoverageMap, detectStaleBins } from '@/analytics/coverage';
import type { SetSummary } from '@/analytics/coverage';

// =============================================================================
// Helpers
// =============================================================================

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY).toISOString();
}

function makeSet(weightLbs: number, daysAgoCount = 0): SetSummary {
  return { weightLbs, startedAt: daysAgo(daysAgoCount) };
}

// =============================================================================
// buildCoverageMap
// =============================================================================

describe('buildCoverageMap', () => {
  it('produces the correct number of bins (default 6)', () => {
    const bins = buildCoverageMap([], 100);
    expect(bins).toHaveLength(6);
  });

  it('returns all bins with pointCount=0 and lastSeenAt=null for empty sets', () => {
    const bins = buildCoverageMap([], 100);
    for (const bin of bins) {
      expect(bin.pointCount).toBe(0);
      expect(bin.lastSeenAt).toBeNull();
      expect(bin.isStale).toBe(false);
    }
  });

  it('assigns correct binIndex values (0-based, ascending)', () => {
    const bins = buildCoverageMap([], 100);
    bins.forEach((bin, i) => {
      expect(bin.binIndex).toBe(i);
    });
  });

  it('bins ranges are contiguous and cover [binMinPctE1RM, binMaxPctE1RM)', () => {
    const bins = buildCoverageMap([], 100);
    // Default: 40% to 100% in 6 bins → each bin 10% wide
    expect(bins[0].binMinPctE1RM).toBeCloseTo(0.4);
    expect(bins[5].binMaxPctE1RM).toBeCloseTo(1.0);
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].binMinPctE1RM).toBeCloseTo(bins[i - 1].binMaxPctE1RM);
    }
  });

  it('5 sets all in the 70-75% bin → that bin has pointCount=5, others have 0', () => {
    const e1RM = 200; // lbs
    // 70-75% of 200 lbs = 140-150 lbs. Use 142, 144, 146, 148, 149.
    const sets = [142, 144, 146, 148, 149].map((w) => makeSet(w, 1));
    const bins = buildCoverageMap(sets, e1RM);
    // Bin 3 covers 70%-80% (default 6 bins over 40-100%)
    const bin3 = bins[3];
    expect(bin3.binMinPctE1RM).toBeCloseTo(0.7);
    expect(bin3.pointCount).toBe(5);
    const others = bins.filter((b) => b.binIndex !== 3);
    for (const b of others) {
      expect(b.pointCount).toBe(0);
    }
  });

  it('sets distributed across bins → correct counts per bin', () => {
    const e1RM = 100;
    const sets = [
      makeSet(45, 1), // 45% → bin 0 [40,50)
      makeSet(55, 1), // 55% → bin 1 [50,60)
      makeSet(65, 1), // 65% → bin 2 [60,70)
      makeSet(65, 2), // also bin 2
      makeSet(75, 1), // 75% → bin 3 [70,80)
      makeSet(85, 1), // 85% → bin 4 [80,90)
      makeSet(95, 1), // 95% → bin 5 [90,100)
    ];
    const bins = buildCoverageMap(sets, e1RM);
    expect(bins[0].pointCount).toBe(1);
    expect(bins[1].pointCount).toBe(1);
    expect(bins[2].pointCount).toBe(2);
    expect(bins[3].pointCount).toBe(1);
    expect(bins[4].pointCount).toBe(1);
    expect(bins[5].pointCount).toBe(1);
  });

  it('lastSeenAt is the max startedAt within each bin', () => {
    const e1RM = 100;
    const older = daysAgo(10);
    const newer = daysAgo(5);
    const sets: SetSummary[] = [
      { weightLbs: 65, startedAt: older },
      { weightLbs: 65, startedAt: newer },
    ];
    const bins = buildCoverageMap(sets, e1RM);
    // bin 2 [60,70)
    expect(bins[2].lastSeenAt).toBe(newer);
  });

  it('set below binMinPctE1RM (30% warmup with default 40%) is excluded entirely', () => {
    const sets = [makeSet(30, 1)]; // 30% of 100 lbs
    const bins = buildCoverageMap(sets, 100);
    const total = bins.reduce((s, b) => s + b.pointCount, 0);
    expect(total).toBe(0);
  });

  it('set above binMaxPctE1RM (105%) is clamped into the top bin', () => {
    const sets = [makeSet(105, 1)]; // 105% of 100 lbs
    const bins = buildCoverageMap(sets, 100);
    const topBin = bins[bins.length - 1];
    expect(topBin.pointCount).toBe(1);
  });

  it('lookbackDays cutoff: set 100 days old excluded with lookbackDays=90', () => {
    const sets = [makeSet(75, 100)]; // 100 days old
    const bins = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    const total = bins.reduce((s, b) => s + b.pointCount, 0);
    expect(total).toBe(0);
  });

  it('lookbackDays cutoff: set within window is included', () => {
    const sets = [makeSet(75, 89)]; // 89 days old, within 90-day window
    const bins = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    const total = bins.reduce((s, b) => s + b.pointCount, 0);
    expect(total).toBe(1);
  });

  it('custom binCount=4 produces exactly 4 bins', () => {
    const bins = buildCoverageMap([], 100, { binCount: 4 });
    expect(bins).toHaveLength(4);
  });

  it('custom binCount=4 bins cover [40%, 100%) in 4 equal slices of 15%', () => {
    const bins = buildCoverageMap([], 100, { binCount: 4 });
    expect(bins[0].binMinPctE1RM).toBeCloseTo(0.4);
    expect(bins[3].binMaxPctE1RM).toBeCloseTo(1.0);
    // Each bin width: (100-40)/4 = 15%
    for (const bin of bins) {
      expect(bin.binMaxPctE1RM - bin.binMinPctE1RM).toBeCloseTo(0.15);
    }
  });

  it('all bins start with isStale=false', () => {
    const sets = [makeSet(70, 1)];
    const bins = buildCoverageMap(sets, 100);
    for (const bin of bins) {
      expect(bin.isStale).toBe(false);
    }
  });
});

// =============================================================================
// detectStaleBins
// =============================================================================

describe('detectStaleBins', () => {
  it('all bins recent → no bins marked stale', () => {
    const sets = [
      makeSet(45, 1),
      makeSet(55, 1),
      makeSet(65, 1),
      makeSet(75, 1),
      makeSet(85, 1),
      makeSet(95, 1),
    ];
    const bins = buildCoverageMap(sets, 100);
    const result = detectStaleBins(bins, 21);
    for (const bin of result) {
      expect(bin.isStale).toBe(false);
    }
  });

  it('bin with lastSeenAt 30 days ago and threshold=21 → marked stale', () => {
    const sets = [{ weightLbs: 75, startedAt: daysAgo(30) }];
    const bins = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    const result = detectStaleBins(bins, 21);
    // bin 3 [70,80) has the set
    expect(result[3].isStale).toBe(true);
  });

  it('bin with lastSeenAt=null (never seen) → marked stale', () => {
    const bins = buildCoverageMap([], 100);
    const result = detectStaleBins(bins, 21);
    for (const bin of result) {
      expect(bin.isStale).toBe(true);
    }
  });

  it('bin within threshold → not stale; bin past threshold → stale', () => {
    const e1RM = 100;
    const sets: SetSummary[] = [
      { weightLbs: 65, startedAt: daysAgo(10) }, // bin 2 — recent
      { weightLbs: 75, startedAt: daysAgo(30) }, // bin 3 — stale
    ];
    const bins = buildCoverageMap(sets, e1RM, { lookbackDays: 90 });
    const result = detectStaleBins(bins, 21);
    expect(result[2].isStale).toBe(false); // 10 days old, within 21
    expect(result[3].isStale).toBe(true); // 30 days old, beyond 21
  });

  it('custom staleness threshold is respected', () => {
    const sets: SetSummary[] = [{ weightLbs: 65, startedAt: daysAgo(5) }];
    const bins = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    // With threshold=3 days, a 5-day-old set is stale
    const result = detectStaleBins(bins, 3);
    expect(result[2].isStale).toBe(true);
    // With threshold=7 days, a 5-day-old set is NOT stale
    const bins2 = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    const result2 = detectStaleBins(bins2, 7);
    expect(result2[2].isStale).toBe(false);
  });

  it('now parameter overrides Date.now() for deterministic testing', () => {
    // Use a set 27 days in the past (well within the default 90-day lookback from now).
    // detectStaleBins uses fixedNow; 27 days > 21-day threshold → stale.
    const setDate = daysAgo(27);
    const fixedNow = new Date(); // "today" from the test runner's perspective
    const sets: SetSummary[] = [{ weightLbs: 65, startedAt: setDate }];
    const bins = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    // bin 2 [60,70) has the set; 27 days old > 21-day threshold → stale
    const result = detectStaleBins(bins, 21, fixedNow);
    expect(result[2].isStale).toBe(true);

    // With a 30-day threshold → 27 days old is NOT stale
    const bins2 = buildCoverageMap(sets, 100, { lookbackDays: 90 });
    const result2 = detectStaleBins(bins2, 30, fixedNow);
    expect(result2[2].isStale).toBe(false);
  });

  it('returns the same array reference (for chaining)', () => {
    const bins = buildCoverageMap([], 100);
    const result = detectStaleBins(bins, 21);
    expect(result).toBe(bins);
  });
});
