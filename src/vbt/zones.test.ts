/**
 * Velocity Zones Tests (WA-02.04)
 */

import { describe, it, expect } from 'vitest';
import { getVelocityZones, categorizeVelocity, type VelocityZones } from '@/vbt/zones';
import { buildProfile } from '@/vbt/profile';
import { DEFAULT_MVT } from '@/vbt/constants';

// A well-fitting linear profile: velocity = -0.015 * load + 1.55.
// 3 points, R² = 1 → confidence 'high'; estimated1RM = (0.17 - 1.55)/-0.015 = 92.
const HIGH_CONFIDENCE_PROFILE = buildProfile([
  { load: 50, velocity: 0.8 },
  { load: 70, velocity: 0.5 },
  { load: 90, velocity: 0.2 },
]);

function assertContiguousCoverage(zones: VelocityZones): void {
  const { bands } = zones;
  expect(bands).toHaveLength(5);
  expect(bands[0].min).toBe(0);
  expect(bands[bands.length - 1].max).toBeNull();
  for (let i = 0; i < bands.length - 1; i++) {
    // Ascending & contiguous: each band's max is the next band's min.
    expect(bands[i].max).toBe(bands[i + 1].min);
    expect(bands[i].max).not.toBeNull();
    expect(bands[i].min).toBeLessThanOrEqual(bands[i].max as number);
  }
}

// =============================================================================
// Source selection
// =============================================================================

describe('getVelocityZones() — source priority', () => {
  it('returns the global compound default with no options', () => {
    const zones = getVelocityZones();
    expect(zones.source).toBe('global-default');
    expect(zones.basis.mvt).toBe(DEFAULT_MVT);
    assertContiguousCoverage(zones);
    // Canonical compound cut-points.
    expect(zones.bands.map((b) => b.max)).toEqual([0.35, 0.5, 0.75, 1.0, null]);
  });

  it('returns the movement-class table when only movementClass is given', () => {
    const zones = getVelocityZones({ movementClass: 'ballistic' });
    expect(zones.source).toBe('movement-class-default');
    expect(zones.basis.movementClass).toBe('ballistic');
    expect(zones.bands.map((b) => b.max)).toEqual([0.5, 0.8, 1.1, 1.4, null]);
  });

  it('shares the constant-tension table for cable and isolation', () => {
    const cable = getVelocityZones({ movementClass: 'cable' });
    const isolation = getVelocityZones({ movementClass: 'isolation' });
    expect(cable.bands.map((b) => b.max)).toEqual([0.25, 0.4, 0.6, 0.85, null]);
    expect(isolation.bands.map((b) => b.max)).toEqual(cable.bands.map((b) => b.max));
  });

  it('derives bands from a usable profile', () => {
    const zones = getVelocityZones({
      profile: HIGH_CONFIDENCE_PROFILE,
      exerciseId: 'cable-row',
      movementClass: 'cable',
    });
    expect(zones.source).toBe('profile');
    expect(zones.basis.v0).toBeCloseTo(HIGH_CONFIDENCE_PROFILE.intercept, 6);
    expect(zones.basis.estimated1RM).toBeCloseTo(92, 0);
    expect(zones.basis.exerciseId).toBe('cable-row');
    assertContiguousCoverage(zones);
  });

  it('profile-derived boundaries are floored at mvt and capped at V0', () => {
    const zones = getVelocityZones({ profile: HIGH_CONFIDENCE_PROFILE });
    const internal = zones.bands.slice(0, 4).map((b) => b.max as number);
    for (const b of internal) {
      expect(b).toBeGreaterThanOrEqual(HIGH_CONFIDENCE_PROFILE.mvt);
      expect(b).toBeLessThanOrEqual(HIGH_CONFIDENCE_PROFILE.intercept);
    }
    // Ascending.
    for (let i = 0; i < internal.length - 1; i++) {
      expect(internal[i]).toBeLessThanOrEqual(internal[i + 1]);
    }
  });

  it('profile-derived bands differ from the class default', () => {
    const profileZones = getVelocityZones({ profile: HIGH_CONFIDENCE_PROFILE });
    const compound = getVelocityZones();
    expect(profileZones.bands.map((b) => b.max)).not.toEqual(compound.bands.map((b) => b.max));
  });

  it('falls through to the class default for a low-confidence profile', () => {
    const lowConf = buildProfile([{ load: 60, velocity: 0.5 }]); // 1 point → 'low'
    expect(lowConf.confidence).toBe('low');
    const zones = getVelocityZones({ profile: lowConf, movementClass: 'cable' });
    expect(zones.source).toBe('movement-class-default');
    expect(zones.bands.map((b) => b.max)).toEqual([0.25, 0.4, 0.6, 0.85, null]);
  });

  it('honors an explicit mvt override', () => {
    const zones = getVelocityZones({ mvt: 0.25 });
    expect(zones.basis.mvt).toBe(0.25);
  });
});

// =============================================================================
// categorizeVelocity
// =============================================================================

describe('categorizeVelocity()', () => {
  it('classifies against the global default when called single-arg (back-compat)', () => {
    expect(categorizeVelocity(0.2)).toBe('grinding');
    expect(categorizeVelocity(0.4)).toBe('maximalStrength');
    expect(categorizeVelocity(0.6)).toBe('strengthSpeed');
    expect(categorizeVelocity(0.9)).toBe('power');
    expect(categorizeVelocity(1.2)).toBe('speed');
  });

  it('lands boundary values in the upper band (min inclusive, max exclusive)', () => {
    expect(categorizeVelocity(0.35)).toBe('maximalStrength');
    expect(categorizeVelocity(0.5)).toBe('strengthSpeed');
    expect(categorizeVelocity(0.75)).toBe('power');
    expect(categorizeVelocity(1.0)).toBe('speed');
    // Just below a boundary stays in the lower band.
    expect(categorizeVelocity(0.3499)).toBe('grinding');
  });

  it('clamps below-zero and zero velocities to grinding', () => {
    expect(categorizeVelocity(0)).toBe('grinding');
    expect(categorizeVelocity(-1)).toBe('grinding');
  });

  it('classifies against injected zones', () => {
    const zones = getVelocityZones({ movementClass: 'cable' });
    // Cable table: grinding<0.25, maxStrength<0.4, strengthSpeed<0.6...
    expect(categorizeVelocity(0.3, zones)).toBe('maximalStrength');
    expect(categorizeVelocity(0.3, getVelocityZones())).toBe('grinding');
  });
});
