/**
 * Load Tests
 *
 * Tests for per-frame load calculation (chains decay, eccentric overload)
 * and the simple effective-load accessor.
 */

import { describe, it, expect } from 'vitest';
import { calculateFrameLoad, getEffectiveLoad } from '@/models/load';
import type { LoadSettings } from '@/models/load';
import { MovementPhase } from '@/models';

// =============================================================================
// Test Helpers
// =============================================================================

function makeSettings(overrides: Partial<LoadSettings> = {}): LoadSettings {
  return {
    weight: 100,
    chains: 0,
    eccentric: 0,
    ...overrides,
  };
}

// =============================================================================
// calculateFrameLoad() - base weight
// =============================================================================

describe('calculateFrameLoad()', () => {
  describe('base weight only', () => {
    it('returns the base weight when chains and eccentric are both 0', () => {
      const settings = makeSettings({ weight: 75, chains: 0, eccentric: 0 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.CONCENTRIC);

      expect(load).toBe(75);
    });

    it('is unaffected by position when chains are 0', () => {
      const settings = makeSettings({ weight: 50, chains: 0 });

      expect(calculateFrameLoad(settings, 0, MovementPhase.CONCENTRIC)).toBe(50);
      expect(calculateFrameLoad(settings, 1, MovementPhase.CONCENTRIC)).toBe(50);
    });

    it('clamps negative weight to 0', () => {
      const settings = makeSettings({ weight: -10, chains: 0, eccentric: 0 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.CONCENTRIC);

      expect(load).toBe(0);
    });
  });

  // ===========================================================================
  // Chains: linear-decay branch
  // ===========================================================================

  describe('chains linear decay', () => {
    it('applies full chains weight at position 0 (cable fully retracted)', () => {
      const settings = makeSettings({ weight: 100, chains: 40 });

      const load = calculateFrameLoad(settings, 0, MovementPhase.CONCENTRIC);

      expect(load).toBe(140); // 100 base + 40 * (1 - 0)
    });

    it('applies zero chains contribution at position 1 (full extension)', () => {
      const settings = makeSettings({ weight: 100, chains: 40 });

      const load = calculateFrameLoad(settings, 1, MovementPhase.CONCENTRIC);

      expect(load).toBe(100); // 100 base + 40 * (1 - 1)
    });

    it('linearly interpolates chains contribution at the midpoint', () => {
      const settings = makeSettings({ weight: 100, chains: 40 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.CONCENTRIC);

      expect(load).toBe(120); // 100 base + 40 * (1 - 0.5)
    });

    it('clamps chains factor to 0 for position beyond 1 (defensive)', () => {
      const settings = makeSettings({ weight: 100, chains: 40 });

      const load = calculateFrameLoad(settings, 1.5, MovementPhase.CONCENTRIC);

      expect(load).toBe(100);
    });

    it('clamps chains factor to 1 for negative position (defensive)', () => {
      const settings = makeSettings({ weight: 100, chains: 40 });

      const load = calculateFrameLoad(settings, -0.5, MovementPhase.CONCENTRIC);

      expect(load).toBe(140);
    });

    it('does not apply chains when chains is 0', () => {
      const settings = makeSettings({ weight: 100, chains: 0 });

      const load = calculateFrameLoad(settings, 0, MovementPhase.CONCENTRIC);

      expect(load).toBe(100);
    });

    it('does not apply chains when chains is negative', () => {
      const settings = makeSettings({ weight: 100, chains: -20 });

      const load = calculateFrameLoad(settings, 0, MovementPhase.CONCENTRIC);

      expect(load).toBe(100); // chains > 0 guard skips negative chains entirely
    });
  });

  // ===========================================================================
  // Eccentric: percentage-adjustment branch
  // ===========================================================================

  describe('eccentric adjustment', () => {
    it('increases load by the eccentric percentage during the eccentric phase (overload)', () => {
      const settings = makeSettings({ weight: 100, eccentric: 20 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.ECCENTRIC);

      expect(load).toBe(120); // 100 + 100 * (20 / 100)
    });

    it('decreases load by the eccentric percentage during the eccentric phase (underload)', () => {
      const settings = makeSettings({ weight: 100, eccentric: -30 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.ECCENTRIC);

      expect(load).toBe(70); // 100 + 100 * (-30 / 100)
    });

    it('does not apply the eccentric adjustment outside the eccentric phase', () => {
      const settings = makeSettings({ weight: 100, eccentric: 50 });

      expect(calculateFrameLoad(settings, 0.5, MovementPhase.CONCENTRIC)).toBe(100);
      expect(calculateFrameLoad(settings, 0.5, MovementPhase.HOLD)).toBe(100);
      expect(calculateFrameLoad(settings, 0.5, MovementPhase.IDLE)).toBe(100);
    });

    it('is a no-op when eccentric is 0, even during the eccentric phase', () => {
      const settings = makeSettings({ weight: 100, eccentric: 0 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.ECCENTRIC);

      expect(load).toBe(100);
    });

    it('clamps to 0 when a large negative eccentric percentage drives load below 0', () => {
      const settings = makeSettings({ weight: 100, eccentric: -195 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.ECCENTRIC);

      expect(load).toBe(0); // 100 + 100 * (-1.95) = -95, clamped to 0
    });

    it('combines chains and eccentric adjustment together during the eccentric phase', () => {
      const settings = makeSettings({ weight: 100, chains: 40, eccentric: 20 });

      // position 0: chains contribute full 40; eccentric adds 20% of base weight (20)
      const load = calculateFrameLoad(settings, 0, MovementPhase.ECCENTRIC);

      expect(load).toBe(160); // 100 + 40 * 1 + 100 * 0.2
    });
  });

  // ===========================================================================
  // Boundary values
  // ===========================================================================

  describe('boundary values', () => {
    it('handles zero weight with chains and eccentric active', () => {
      const settings = makeSettings({ weight: 0, chains: 20, eccentric: 50 });

      const load = calculateFrameLoad(settings, 0, MovementPhase.ECCENTRIC);

      expect(load).toBe(20); // 0 base + 20 chains + 0 * 0.5 eccentric
    });

    it('handles the maximum eccentric overload percentage (195)', () => {
      const settings = makeSettings({ weight: 100, eccentric: 195 });

      const load = calculateFrameLoad(settings, 0.5, MovementPhase.ECCENTRIC);

      expect(load).toBe(295); // 100 + 100 * 1.95
    });
  });
});

// =============================================================================
// getEffectiveLoad()
// =============================================================================

describe('getEffectiveLoad()', () => {
  it('returns the base weight regardless of chains and eccentric settings', () => {
    const settings = makeSettings({ weight: 85, chains: 40, eccentric: 30 });

    expect(getEffectiveLoad(settings)).toBe(85);
  });

  it('returns 0 for default (unconfigured) load settings', () => {
    const settings = makeSettings({ weight: 0 });

    expect(getEffectiveLoad(settings)).toBe(0);
  });

  it('does not mutate the input settings', () => {
    const settings = makeSettings({ weight: 50 });
    const snapshot = { ...settings };

    getEffectiveLoad(settings);

    expect(settings).toEqual(snapshot);
  });
});
