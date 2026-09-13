/**
 * Velocity Baseline Tests
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  buildBaseline,
  getExpectedVelocity,
  updateBaselineWithPoint,
  serializeBaseline,
  deserializeBaseline,
} from '@/vbt/baseline';
import type { SerializedBaseline } from '@/vbt/baseline';
import type { BaselineKey } from '@/models/baseline-key';
import { buildProfile } from '@/vbt/profile';
import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Test Data
// =============================================================================

const HISTORICAL_DATA: LoadVelocityDataPoint[] = [
  { load: 30, velocity: 1.0 },
  { load: 50, velocity: 0.75 },
  { load: 70, velocity: 0.55 },
  { load: 90, velocity: 0.3 },
];

// =============================================================================
// buildBaseline
// =============================================================================

describe('buildBaseline', () => {
  it('sorts data points by load', () => {
    const unsorted: LoadVelocityDataPoint[] = [
      { load: 70, velocity: 0.55 },
      { load: 30, velocity: 1.0 },
      { load: 50, velocity: 0.75 },
    ];
    const baseline = buildBaseline(unsorted);
    expect(baseline.dataPoints[0].load).toBe(30);
    expect(baseline.dataPoints[1].load).toBe(50);
    expect(baseline.dataPoints[2].load).toBe(70);
  });

  it('handles empty input', () => {
    const baseline = buildBaseline([]);
    expect(baseline.dataPoints).toHaveLength(0);
  });

  it('preserves all data points', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(baseline.dataPoints).toHaveLength(4);
  });
});

// =============================================================================
// getExpectedVelocity
// =============================================================================

describe('getExpectedVelocity', () => {
  it('returns exact velocity at known load', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(getExpectedVelocity(baseline, 30)).toBe(1.0);
    expect(getExpectedVelocity(baseline, 90)).toBe(0.3);
  });

  it('interpolates between known loads', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    // 40 is between 30 (1.00) and 50 (0.75) -> 0.875
    expect(getExpectedVelocity(baseline, 40)).toBeCloseTo(0.875, 3);
  });

  it('interpolates at midpoint correctly', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    // 60 is between 50 (0.75) and 70 (0.55) -> 0.65
    expect(getExpectedVelocity(baseline, 60)).toBeCloseTo(0.65, 3);
  });

  it('returns null for load below range', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(getExpectedVelocity(baseline, 10)).toBeNull();
  });

  it('returns null for load above range', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    expect(getExpectedVelocity(baseline, 100)).toBeNull();
  });

  it('returns null for empty baseline', () => {
    const baseline = buildBaseline([]);
    expect(getExpectedVelocity(baseline, 50)).toBeNull();
  });

  it('returns velocity for single point only if load matches exactly', () => {
    const baseline = buildBaseline([{ load: 50, velocity: 0.75 }]);
    expect(getExpectedVelocity(baseline, 50)).toBe(0.75);
    expect(getExpectedVelocity(baseline, 51)).toBeNull();
  });
});

// =============================================================================
// updateBaselineWithPoint
// =============================================================================

describe('updateBaselineWithPoint', () => {
  it('returns a new baseline and does not mutate the original', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const updated = updateBaselineWithPoint(original, 60, 0.62);

    expect(updated).not.toBe(original);
    expect(original.dataPoints).toHaveLength(4);
    expect(updated.dataPoints).toHaveLength(5);
  });

  it('preserves all existing data points', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const updated = updateBaselineWithPoint(original, 60, 0.62);

    const originalLoads = HISTORICAL_DATA.map((p) => p.load);
    for (const load of originalLoads) {
      expect(updated.dataPoints.some((p) => p.load === load)).toBe(true);
    }
  });

  it('adds the new point correctly', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const updated = updateBaselineWithPoint(original, 60, 0.62);

    const newPoint = updated.dataPoints.find((p) => p.load === 60);
    expect(newPoint).toBeDefined();
    expect(newPoint?.velocity).toBe(0.62);
  });

  it('keeps result sorted by load after adding a point in the middle', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const updated = updateBaselineWithPoint(original, 60, 0.62);

    for (let i = 0; i < updated.dataPoints.length - 1; i++) {
      expect(updated.dataPoints[i].load).toBeLessThanOrEqual(updated.dataPoints[i + 1].load);
    }
  });

  it('drops the oldest point when maxPoints cap is reached (timestamp-based)', () => {
    const timedData: LoadVelocityDataPoint[] = [
      { load: 30, velocity: 1.0, timestamp: 1000 },
      { load: 50, velocity: 0.75, timestamp: 2000 },
      { load: 70, velocity: 0.55, timestamp: 3000 },
    ];
    const original = buildBaseline(timedData);
    const updated = updateBaselineWithPoint(original, 90, 0.3, {
      maxPoints: 3,
      timestamp: 4000,
    });

    expect(updated.dataPoints).toHaveLength(3);
    // load=30 (timestamp 1000) should have been dropped as oldest
    expect(updated.dataPoints.some((p) => p.load === 30)).toBe(false);
    expect(updated.dataPoints.some((p) => p.load === 90)).toBe(true);
  });

  it('evicts the oldest point even when it carries the highest load', () => {
    const original = buildBaseline([
      { load: 90, velocity: 0.3, timestamp: 1000 },
      { load: 30, velocity: 1.0, timestamp: 2000 },
      { load: 50, velocity: 0.75, timestamp: 3000 },
    ]);
    const updated = updateBaselineWithPoint(original, 70, 0.55, {
      maxPoints: 3,
      timestamp: 4000,
    });

    expect(updated.dataPoints.some((p) => p.load === 90)).toBe(false);
    expect(updated.dataPoints.some((p) => p.load === 30)).toBe(true);
  });

  it('does not drop any point when below the maxPoints cap', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const updated = updateBaselineWithPoint(original, 60, 0.62, { maxPoints: 10 });

    expect(updated.dataPoints).toHaveLength(5);
  });

  it('interpolation remains monotone after update', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const updated = updateBaselineWithPoint(original, 60, 0.62);

    // velocity should decrease as load increases within the range
    const v50 = getExpectedVelocity(updated, 50);
    const v60 = getExpectedVelocity(updated, 60);
    const v70 = getExpectedVelocity(updated, 70);

    expect(v50).not.toBeNull();
    expect(v60).not.toBeNull();
    expect(v70).not.toBeNull();
    expect(v50!).toBeGreaterThan(v60!);
    expect(v60!).toBeGreaterThan(v70!);
  });

  it('stamps the new point with Date.now() when no timestamp is supplied', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const updated = updateBaselineWithPoint(buildBaseline(HISTORICAL_DATA), 60, 0.62);

    expect(updated.dataPoints.find((p) => p.load === 60)?.timestamp).toBe(1_700_000_000_000);
    vi.useRealTimers();
  });

  it('uses an explicit timestamp in preference to the clock', () => {
    const updated = updateBaselineWithPoint(buildBaseline(HISTORICAL_DATA), 60, 0.62, {
      timestamp: 4000,
    });

    expect(updated.dataPoints.find((p) => p.load === 60)?.timestamp).toBe(4000);
  });
});

// =============================================================================
// Eviction from an untimestamped (legacy) baseline.
//
// KNOWN-ISSUES-2026-07-27 §4: the documented `Date.now()` default was never
// implemented, so `hasTimestamps` could never hold for a baseline whose points
// carried none, and eviction fell through to `combined.slice(1)` on a
// load-sorted array — dropping the LOWEST LOAD every time.
// =============================================================================

describe('updateBaselineWithPoint on an untimestamped baseline', () => {
  /** Slightly convex, as a real load-velocity profile is. Perfect line would hide the bias. */
  const LEGACY_SPREAD: LoadVelocityDataPoint[] = [
    { load: 40, velocity: 1.05 },
    { load: 50, velocity: 0.92 },
    { load: 60, velocity: 0.8 },
    { load: 70, velocity: 0.69 },
    { load: 80, velocity: 0.59 },
    { load: 90, velocity: 0.5 },
  ];

  /** Three sessions of working-load observations, on the same curve. */
  const WORKING_OBSERVATIONS: Array<[number, number]> = [
    [70, 0.69],
    [75, 0.64],
    [80, 0.59],
  ];

  function addAll(points: LoadVelocityDataPoint[], maxPoints: number) {
    let baseline = buildBaseline(points);
    for (const [load, velocity] of WORKING_OBSERVATIONS) {
      baseline = updateBaselineWithPoint(baseline, load, velocity, { maxPoints });
    }
    return baseline;
  }

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the lowest-load point rather than evicting it', () => {
    const updated = updateBaselineWithPoint(buildBaseline(LEGACY_SPREAD), 75, 0.64, {
      maxPoints: 6,
    });

    expect(updated.dataPoints).toHaveLength(6);
    expect(updated.dataPoints.some((p) => p.load === 40)).toBe(true);
  });

  it('does not eat the load-velocity profile from below over repeated updates', () => {
    const updated = addAll(LEGACY_SPREAD, 6);

    // Pre-fix this retained 70,70,75,80,80,90 — the whole sub-70 span gone.
    expect(updated.dataPoints.map((p) => p.load)).toEqual([40, 50, 70, 75, 80, 90]);
  });

  it('holds V0 and the 1RM estimate within 1% across three capped updates', () => {
    const before = buildProfile([...LEGACY_SPREAD]);
    const after = buildProfile([...addAll(LEGACY_SPREAD, 6).dataPoints]);

    // Pre-fix figures for this fixture: V0 1.4733 -> 1.3580 (-7.8%),
    // estimated1RM 118.485 -> 124.197 (+4.8%).
    expect(after.intercept).toBeCloseTo(1.4803, 4);
    expect(after.estimated1RM).toBeCloseTo(118.142, 3);
    expect(Math.abs(after.intercept / before.intercept - 1)).toBeLessThan(0.01);
    expect(Math.abs(after.estimated1RM / before.estimated1RM - 1)).toBeLessThan(0.01);
  });

  it('evicts the point of lowest regression leverage, not an end point', () => {
    const updated = updateBaselineWithPoint(buildBaseline(LEGACY_SPREAD), 75, 0.64, {
      maxPoints: 6,
    });

    // Mean load of the 7 combined points is 66.4, so load=70 is nearest it.
    expect(updated.dataPoints.map((p) => p.load)).toEqual([40, 50, 60, 75, 80, 90]);
  });

  it('ranks an untimestamped point as older than any stamped point', () => {
    const mixed = buildBaseline([
      { load: 40, velocity: 1.05 },
      { load: 60, velocity: 0.8, timestamp: 1000 },
      { load: 90, velocity: 0.5, timestamp: 2000 },
    ]);
    const updated = updateBaselineWithPoint(mixed, 70, 0.69, { maxPoints: 3, timestamp: 3000 });

    expect(updated.dataPoints.some((p) => p.load === 40)).toBe(false);
    expect(updated.dataPoints.map((p) => p.load)).toEqual([60, 70, 90]);
  });

  it('leaves surviving legacy points untimestamped rather than fabricating an age', () => {
    const updated = updateBaselineWithPoint(buildBaseline(LEGACY_SPREAD), 75, 0.64, {
      maxPoints: 6,
      timestamp: 5000,
    });
    const serialized = serializeBaseline(updated);

    for (const point of serialized.dataPoints.filter((p) => p.load !== 75)) {
      expect('timestamp' in point).toBe(false);
    }
    expect(serialized.dataPoints.find((p) => p.load === 75)?.timestamp).toBe(5000);
  });
});

describe('untimestamped eviction warning', () => {
  it('warns once per process when evicting from an untimestamped baseline', async () => {
    vi.resetModules();
    const mod = await import('@/vbt/baseline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const legacy = mod.buildBaseline([
      { load: 30, velocity: 1.0 },
      { load: 50, velocity: 0.75 },
      { load: 70, velocity: 0.55 },
    ]);

    mod.updateBaselineWithPoint(legacy, 90, 0.3, { maxPoints: 3 });
    mod.updateBaselineWithPoint(legacy, 80, 0.4, { maxPoints: 3 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('LOWEST-LOAD');
    warn.mockRestore();
  });

  it('does not warn when every point carries a timestamp', async () => {
    vi.resetModules();
    const mod = await import('@/vbt/baseline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const timed = mod.buildBaseline([
      { load: 30, velocity: 1.0, timestamp: 1000 },
      { load: 50, velocity: 0.75, timestamp: 2000 },
      { load: 70, velocity: 0.55, timestamp: 3000 },
    ]);

    mod.updateBaselineWithPoint(timed, 90, 0.3, { maxPoints: 3, timestamp: 4000 });

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn when no cap forces an eviction', async () => {
    vi.resetModules();
    const mod = await import('@/vbt/baseline');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mod.updateBaselineWithPoint(mod.buildBaseline(HISTORICAL_DATA), 60, 0.62);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

// =============================================================================
// serializeBaseline / deserializeBaseline
// =============================================================================

describe('serializeBaseline', () => {
  it('produces version 1 output', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    const serialized = serializeBaseline(baseline);
    expect(serialized.version).toBe(1);
  });

  it('includes all data points', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    const serialized = serializeBaseline(baseline);
    expect(serialized.dataPoints).toHaveLength(4);
  });

  it('preserves load and velocity on each point', () => {
    const baseline = buildBaseline(HISTORICAL_DATA);
    const serialized = serializeBaseline(baseline);

    for (const point of HISTORICAL_DATA) {
      const found = serialized.dataPoints.find((p) => p.load === point.load);
      expect(found).toBeDefined();
      expect(found?.velocity).toBe(point.velocity);
    }
  });

  it('includes timestamp when present on a data point', () => {
    const baseline = buildBaseline([{ load: 50, velocity: 0.75, timestamp: 1234567890 }]);
    const serialized = serializeBaseline(baseline);
    expect(serialized.dataPoints[0].timestamp).toBe(1234567890);
  });

  it('omits timestamp field when absent on a data point', () => {
    const baseline = buildBaseline([{ load: 50, velocity: 0.75 }]);
    const serialized = serializeBaseline(baseline);
    expect('timestamp' in serialized.dataPoints[0]).toBe(false);
  });
});

describe('deserializeBaseline', () => {
  it('round-trips through serialize → deserialize with deep equality', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const serialized = serializeBaseline(original);
    const restored = deserializeBaseline(serialized);

    expect(restored.dataPoints).toHaveLength(original.dataPoints.length);
    for (let i = 0; i < original.dataPoints.length; i++) {
      expect(restored.dataPoints[i].load).toBe(original.dataPoints[i].load);
      expect(restored.dataPoints[i].velocity).toBe(original.dataPoints[i].velocity);
    }
  });

  it('round-trips timestamp fields', () => {
    const timedData: LoadVelocityDataPoint[] = [
      { load: 30, velocity: 1.0, timestamp: 1000 },
      { load: 50, velocity: 0.75, timestamp: 2000 },
    ];
    const original = buildBaseline(timedData);
    const restored = deserializeBaseline(serializeBaseline(original));

    const p30 = restored.dataPoints.find((p) => p.load === 30);
    expect(p30?.timestamp).toBe(1000);
  });

  it('handles missing timestamp field on deserialized points gracefully', () => {
    const raw: SerializedBaseline = {
      version: 1,
      dataPoints: [
        { load: 30, velocity: 1.0 },
        { load: 50, velocity: 0.75, timestamp: 2000 },
      ],
    };
    const baseline = deserializeBaseline(raw);
    expect(baseline.dataPoints).toHaveLength(2);

    const p30 = baseline.dataPoints.find((p) => p.load === 30);
    expect(p30).toBeDefined();
    expect('timestamp' in p30!).toBe(false);
  });

  it('restored baseline supports interpolation identically to the original', () => {
    const original = buildBaseline(HISTORICAL_DATA);
    const restored = deserializeBaseline(serializeBaseline(original));

    expect(getExpectedVelocity(restored, 40)).toBeCloseTo(getExpectedVelocity(original, 40)!, 5);
    expect(getExpectedVelocity(restored, 60)).toBeCloseTo(getExpectedVelocity(original, 60)!, 5);
  });

  it('handles empty dataPoints array', () => {
    const raw: SerializedBaseline = { version: 1, dataPoints: [] };
    const baseline = deserializeBaseline(raw);
    expect(baseline.dataPoints).toHaveLength(0);
    expect(getExpectedVelocity(baseline, 50)).toBeNull();
  });
});

// =============================================================================
// BaselineKey identity
// =============================================================================

describe('baseline identity', () => {
  const KEY: BaselineKey = {
    userId: 'u1',
    exerciseId: 'cable-row',
    setupId: 'bench-low',
    side: 'left',
  };

  it('omits key when none is supplied', () => {
    expect(buildBaseline(HISTORICAL_DATA).key).toBeUndefined();
    expect(serializeBaseline(buildBaseline(HISTORICAL_DATA)).key).toBeUndefined();
  });

  it('stamps the key onto the built baseline', () => {
    expect(buildBaseline(HISTORICAL_DATA, KEY).key).toEqual(KEY);
  });

  it('survives a serialize/deserialize round trip', () => {
    const restored = deserializeBaseline(serializeBaseline(buildBaseline(HISTORICAL_DATA, KEY)));

    expect(restored.key).toEqual(KEY);
  });

  it('preserves the key when a point is added', () => {
    const updated = updateBaselineWithPoint(buildBaseline(HISTORICAL_DATA, KEY), 55, 0.62);

    expect(updated.key).toEqual(KEY);
  });

  it('tolerates a keyless payload written before keys existed', () => {
    const raw: SerializedBaseline = { version: 1, dataPoints: [{ load: 50, velocity: 0.6 }] };

    expect(deserializeBaseline(raw).key).toBeUndefined();
  });
});
