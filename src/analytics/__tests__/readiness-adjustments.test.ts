/**
 * Tests for computeReadinessAdjustments
 *
 * Verifies that each readiness band produces the correct categorical
 * recommendation, weight direction, volume direction, and boundary
 * consistency.
 */

import { describe, it, expect } from 'vitest';
import {
  computeReadinessAdjustments,
  type ReadinessAdjustmentInputs,
} from '@/analytics/readiness-adjustments';
import type { ReadinessEstimate } from '@/analytics/session';

// =============================================================================
// Test helpers
// =============================================================================

function makeEstimate(velocityRatio: number, confidence = 0.8): ReadinessEstimate {
  let zone: 'green' | 'yellow' | 'red';
  if (velocityRatio >= 0.95) zone = 'green';
  else if (velocityRatio >= 0.85) zone = 'yellow';
  else zone = 'red';
  return { zone, velocityRatio, confidence };
}

function makeInputs(
  velocityRatio: number,
  overrides: Partial<Omit<ReadinessAdjustmentInputs, 'readiness'>> = {}
): ReadinessAdjustmentInputs {
  return {
    readiness: makeEstimate(velocityRatio),
    plannedWeightLbs: 225,
    plannedSets: 4,
    ...overrides,
  };
}

// =============================================================================
// Categorical recommendation by band
// =============================================================================

describe('computeReadinessAdjustments — categorical recommendation', () => {
  it('returns rest_day when velocityRatio < 0.2', () => {
    const result = computeReadinessAdjustments(makeInputs(0.15));
    expect(result.recommendation).toBe('rest_day');
  });

  it('returns reduce_volume when velocityRatio is 0.2–0.4 (exclusive upper)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.3));
    expect(result.recommendation).toBe('reduce_volume');
  });

  it('returns reduce_load when velocityRatio is 0.4–0.6 (exclusive upper)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.5));
    expect(result.recommendation).toBe('reduce_load');
  });

  it('returns maintain when velocityRatio is 0.6–0.8 (exclusive upper)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.7));
    expect(result.recommendation).toBe('maintain');
  });

  it('returns push when velocityRatio >= 0.8 and recentFatigue is low', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { recentFatigue: 0.1 }));
    expect(result.recommendation).toBe('push');
  });

  it('returns maintain when velocityRatio >= 0.8 but recentFatigue >= 0.3', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { recentFatigue: 0.35 }));
    expect(result.recommendation).toBe('maintain');
  });
});

// =============================================================================
// Weight adjustment direction
// =============================================================================

describe('computeReadinessAdjustments — weightAdjustmentLbs', () => {
  it('reduce_load produces negative weight adjustment', () => {
    const result = computeReadinessAdjustments(makeInputs(0.5));
    expect(result.weightAdjustmentLbs).toBeLessThan(0);
  });

  it('maintain produces zero weight adjustment', () => {
    const result = computeReadinessAdjustments(makeInputs(0.7));
    expect(result.weightAdjustmentLbs).toBe(0);
  });

  it('push produces positive weight adjustment', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { recentFatigue: 0.0 }));
    expect(result.weightAdjustmentLbs).toBeGreaterThan(0);
  });

  it('reduce_volume keeps weight unchanged', () => {
    const result = computeReadinessAdjustments(makeInputs(0.35));
    expect(result.weightAdjustmentLbs).toBe(0);
  });
});

// =============================================================================
// Volume adjustment (set count)
// =============================================================================

describe('computeReadinessAdjustments — volumeAdjustmentSets', () => {
  it('reduce_volume skips one set', () => {
    const result = computeReadinessAdjustments(makeInputs(0.3));
    expect(result.volumeAdjustmentSets).toBe(-1);
  });

  it('reduce_load does not change set count', () => {
    const result = computeReadinessAdjustments(makeInputs(0.5));
    expect(result.volumeAdjustmentSets).toBe(0);
  });

  it('maintain does not change set count', () => {
    const result = computeReadinessAdjustments(makeInputs(0.7));
    expect(result.volumeAdjustmentSets).toBe(0);
  });

  it('push does not change set count (weight increase preferred)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { recentFatigue: 0.0 }));
    expect(result.volumeAdjustmentSets).toBe(0);
  });
});

// =============================================================================
// Boundary value consistency (inclusive / exclusive edges)
// =============================================================================

describe('computeReadinessAdjustments — boundary consistency', () => {
  it('velocityRatio exactly 0.2 is reduce_volume (not rest_day)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.2));
    expect(result.recommendation).toBe('reduce_volume');
  });

  it('velocityRatio exactly 0.4 is reduce_load (not reduce_volume)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.4));
    expect(result.recommendation).toBe('reduce_load');
  });

  it('velocityRatio exactly 0.6 is maintain (not reduce_load)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.6));
    expect(result.recommendation).toBe('maintain');
  });

  it('velocityRatio exactly 0.8 is push (not maintain) when fatigue is low', () => {
    const result = computeReadinessAdjustments(makeInputs(0.8, { recentFatigue: 0.0 }));
    expect(result.recommendation).toBe('push');
  });

  it('velocityRatio just below 0.2 is rest_day', () => {
    const result = computeReadinessAdjustments(makeInputs(0.19));
    expect(result.recommendation).toBe('rest_day');
  });
});

// =============================================================================
// recentFatigue gate
// =============================================================================

describe('computeReadinessAdjustments — recentFatigue gate', () => {
  it('high readiness + fatigue exactly 0.3 triggers maintain (not push)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.95, { recentFatigue: 0.3 }));
    expect(result.recommendation).toBe('maintain');
  });

  it('high readiness + fatigue just below 0.3 triggers push', () => {
    const result = computeReadinessAdjustments(makeInputs(0.95, { recentFatigue: 0.29 }));
    expect(result.recommendation).toBe('push');
  });

  it('recentFatigue defaults to 0 (no fatigue) when omitted', () => {
    // velocityRatio 0.85 would be push with no fatigue
    const result = computeReadinessAdjustments(makeInputs(0.85));
    expect(result.recommendation).toBe('push');
  });
});

// =============================================================================
// daysSinceLastTrained override
// =============================================================================

describe('computeReadinessAdjustments — daysSinceLastTrained override', () => {
  it('> 21 days triggers rest_day regardless of good readiness', () => {
    const result = computeReadinessAdjustments(makeInputs(0.95, { daysSinceLastTrained: 22 }));
    expect(result.recommendation).toBe('rest_day');
  });

  it('> 21 days triggers rest_day regardless of poor readiness', () => {
    const result = computeReadinessAdjustments(makeInputs(0.3, { daysSinceLastTrained: 30 }));
    expect(result.recommendation).toBe('rest_day');
  });

  it('exactly 21 days does not override (normal zone logic applies)', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { daysSinceLastTrained: 21 }));
    expect(result.recommendation).not.toBe('rest_day');
  });

  it('long-layoff rest_day includes negative weight adjustment (deload)', () => {
    const result = computeReadinessAdjustments(
      makeInputs(0.9, { plannedWeightLbs: 200, daysSinceLastTrained: 30 })
    );
    expect(result.weightAdjustmentLbs).toBeLessThan(0);
  });

  it('long-layoff rest_day includes negative volume adjustment', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { daysSinceLastTrained: 30 }));
    expect(result.volumeAdjustmentSets).toBeLessThan(0);
  });
});

// =============================================================================
// Confidence propagation
// =============================================================================

describe('computeReadinessAdjustments — confidence propagation', () => {
  it('high numeric confidence (>= 0.75) maps to high categorical confidence', () => {
    const inputs: ReadinessAdjustmentInputs = {
      readiness: makeEstimate(0.7, 0.9),
      plannedWeightLbs: 200,
      plannedSets: 3,
    };
    const result = computeReadinessAdjustments(inputs);
    expect(result.confidence).toBe('high');
  });

  it('medium numeric confidence (0.45–0.74) maps to medium categorical confidence', () => {
    const inputs: ReadinessAdjustmentInputs = {
      readiness: makeEstimate(0.7, 0.5),
      plannedWeightLbs: 200,
      plannedSets: 3,
    };
    const result = computeReadinessAdjustments(inputs);
    expect(result.confidence).toBe('medium');
  });

  it('low numeric confidence (< 0.45) maps to low categorical confidence', () => {
    const inputs: ReadinessAdjustmentInputs = {
      readiness: makeEstimate(0.7, 0.2),
      plannedWeightLbs: 200,
      plannedSets: 3,
    };
    const result = computeReadinessAdjustments(inputs);
    expect(result.confidence).toBe('low');
  });
});

// =============================================================================
// reasoning field
// =============================================================================

describe('computeReadinessAdjustments — reasoning field', () => {
  it('returns a non-empty reasoning string for every band', () => {
    const ratios = [0.1, 0.3, 0.5, 0.7, 0.85, 0.95];
    for (const ratio of ratios) {
      const result = computeReadinessAdjustments(makeInputs(ratio));
      expect(result.reasoning.length).toBeGreaterThan(0);
    }
  });

  it('rest_day from daysSinceLastTrained mentions the day count', () => {
    const result = computeReadinessAdjustments(makeInputs(0.9, { daysSinceLastTrained: 28 }));
    expect(result.reasoning).toContain('28');
  });
});
