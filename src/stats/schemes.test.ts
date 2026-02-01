/**
 * Classification Schemes Tests
 *
 * Tests for breakpoint classification and interpolation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  classifyByBreakpoints,
  interpolate,
  createBreakpointScheme,
  createInterpolationScheme,
  DEFAULT_RIR_SCHEME,
  DEFAULT_CONSISTENCY_SCHEME,
  DEFAULT_OUTLIER_SCHEME,
  DEFAULT_QUALITY_SCHEME,
  DEFAULT_CONFIDENCE_SCHEME,
  type BreakpointScheme,
  type InterpolationScheme,
} from './schemes';

// =============================================================================
// classifyByBreakpoints() Tests
// =============================================================================

describe('classifyByBreakpoints()', () => {
  const booleanScheme: BreakpointScheme<boolean> = {
    breakpoints: [{ below: 2.0, value: false }],
    fallback: true,
  };

  const multiScheme: BreakpointScheme<'low' | 'medium' | 'high'> = {
    breakpoints: [
      { below: 10, value: 'low' },
      { below: 50, value: 'medium' },
    ],
    fallback: 'high',
  };

  it('returns first matching breakpoint value', () => {
    expect(classifyByBreakpoints(1.5, booleanScheme)).toBe(false);
    expect(classifyByBreakpoints(5, multiScheme)).toBe('low');
    expect(classifyByBreakpoints(25, multiScheme)).toBe('medium');
  });

  it('returns fallback when no breakpoint matches', () => {
    expect(classifyByBreakpoints(2.0, booleanScheme)).toBe(true);
    expect(classifyByBreakpoints(2.5, booleanScheme)).toBe(true);
    expect(classifyByBreakpoints(50, multiScheme)).toBe('high');
    expect(classifyByBreakpoints(100, multiScheme)).toBe('high');
  });

  it('handles exact boundary values', () => {
    // Value exactly at breakpoint is NOT below, so moves to next
    expect(classifyByBreakpoints(10, multiScheme)).toBe('medium');
    expect(classifyByBreakpoints(50, multiScheme)).toBe('high');
  });

  it('handles negative values', () => {
    expect(classifyByBreakpoints(-5, multiScheme)).toBe('low');
  });

  it('handles empty breakpoints array', () => {
    const emptyScheme: BreakpointScheme<string> = {
      breakpoints: [],
      fallback: 'default',
    };
    expect(classifyByBreakpoints(100, emptyScheme)).toBe('default');
  });
});

// =============================================================================
// interpolate() Tests
// =============================================================================

describe('interpolate()', () => {
  const linearScheme: InterpolationScheme = {
    points: [
      { input: 0, output: 100 },
      { input: 100, output: 0 },
    ],
  };

  const multiPointScheme: InterpolationScheme = {
    points: [
      { input: 0, output: 6 },
      { input: 30, output: 3 },
      { input: 60, output: 0 },
    ],
  };

  it('returns exact output at defined points', () => {
    expect(interpolate(0, linearScheme)).toBe(100);
    expect(interpolate(100, linearScheme)).toBe(0);
    expect(interpolate(30, multiPointScheme)).toBe(3);
  });

  it('interpolates linearly between points', () => {
    expect(interpolate(50, linearScheme)).toBe(50);
    expect(interpolate(25, linearScheme)).toBe(75);
    expect(interpolate(75, linearScheme)).toBe(25);
  });

  it('interpolates correctly in multi-point scheme', () => {
    // Between 0→6 and 30→3: at input 15, output should be 4.5
    expect(interpolate(15, multiPointScheme)).toBe(4.5);
    // Between 30→3 and 60→0: at input 45, output should be 1.5
    expect(interpolate(45, multiPointScheme)).toBe(1.5);
  });

  it('clamps below first point', () => {
    expect(interpolate(-10, linearScheme)).toBe(100);
    expect(interpolate(-100, multiPointScheme)).toBe(6);
  });

  it('clamps above last point', () => {
    expect(interpolate(150, linearScheme)).toBe(0);
    expect(interpolate(100, multiPointScheme)).toBe(0);
  });

  it('handles single point scheme', () => {
    const singlePoint: InterpolationScheme = {
      points: [{ input: 50, output: 25 }],
    };
    expect(interpolate(0, singlePoint)).toBe(25);
    expect(interpolate(50, singlePoint)).toBe(25);
    expect(interpolate(100, singlePoint)).toBe(25);
  });

  it('throws on empty points array', () => {
    const emptyScheme: InterpolationScheme = { points: [] };
    expect(() => interpolate(50, emptyScheme)).toThrow();
  });

  it('handles non-monotonic outputs', () => {
    // Output can go up and down
    const nonMonotonic: InterpolationScheme = {
      points: [
        { input: 0, output: 0 },
        { input: 50, output: 100 },
        { input: 100, output: 50 },
      ],
    };
    expect(interpolate(25, nonMonotonic)).toBe(50);
    expect(interpolate(75, nonMonotonic)).toBe(75);
  });
});

// =============================================================================
// createBreakpointScheme() Tests
// =============================================================================

describe('createBreakpointScheme()', () => {
  it('creates scheme with sorted breakpoints', () => {
    const scheme = createBreakpointScheme(
      [
        { below: 50, value: 'b' },
        { below: 10, value: 'a' },
        { below: 90, value: 'c' },
      ],
      'd'
    );

    // Should be sorted by 'below' value
    expect(scheme.breakpoints[0].below).toBe(10);
    expect(scheme.breakpoints[1].below).toBe(50);
    expect(scheme.breakpoints[2].below).toBe(90);
  });

  it('sets fallback correctly', () => {
    const scheme = createBreakpointScheme([{ below: 10, value: 'low' }], 'high');
    expect(scheme.fallback).toBe('high');
  });

  it('creates working scheme', () => {
    const scheme = createBreakpointScheme(
      [
        { below: 20, value: 'low' },
        { below: 80, value: 'medium' },
      ],
      'high'
    );

    expect(classifyByBreakpoints(10, scheme)).toBe('low');
    expect(classifyByBreakpoints(50, scheme)).toBe('medium');
    expect(classifyByBreakpoints(90, scheme)).toBe('high');
  });
});

// =============================================================================
// createInterpolationScheme() Tests
// =============================================================================

describe('createInterpolationScheme()', () => {
  it('creates scheme with sorted points', () => {
    const scheme = createInterpolationScheme([
      { input: 50, output: 50 },
      { input: 0, output: 100 },
      { input: 100, output: 0 },
    ]);

    expect(scheme.points[0].input).toBe(0);
    expect(scheme.points[1].input).toBe(50);
    expect(scheme.points[2].input).toBe(100);
  });

  it('creates working scheme', () => {
    const scheme = createInterpolationScheme([
      { input: 100, output: 0 },
      { input: 0, output: 100 },
    ]);

    expect(interpolate(50, scheme)).toBe(50);
  });
});

// =============================================================================
// Default Schemes Tests
// =============================================================================

describe('DEFAULT_RIR_SCHEME', () => {
  it('returns 6 for 0% velocity loss', () => {
    expect(interpolate(0, DEFAULT_RIR_SCHEME)).toBe(6);
  });

  it('returns 0 for 60%+ velocity loss', () => {
    expect(interpolate(60, DEFAULT_RIR_SCHEME)).toBe(0);
    expect(interpolate(100, DEFAULT_RIR_SCHEME)).toBe(0);
  });

  it('interpolates correctly at intermediate values', () => {
    expect(interpolate(10, DEFAULT_RIR_SCHEME)).toBe(5);
    expect(interpolate(20, DEFAULT_RIR_SCHEME)).toBe(4);
    expect(interpolate(30, DEFAULT_RIR_SCHEME)).toBe(3);
    expect(interpolate(40, DEFAULT_RIR_SCHEME)).toBe(2);
    expect(interpolate(50, DEFAULT_RIR_SCHEME)).toBe(1);
  });

  it('interpolates between defined points', () => {
    // At 15% loss, should be halfway between 5 and 4
    expect(interpolate(15, DEFAULT_RIR_SCHEME)).toBe(4.5);
    // At 25% loss, should be halfway between 4 and 3
    expect(interpolate(25, DEFAULT_RIR_SCHEME)).toBe(3.5);
  });
});

describe('DEFAULT_CONSISTENCY_SCHEME', () => {
  it('classifies low CV as stable', () => {
    expect(classifyByBreakpoints(0.05, DEFAULT_CONSISTENCY_SCHEME)).toBe('stable');
    expect(classifyByBreakpoints(0.09, DEFAULT_CONSISTENCY_SCHEME)).toBe('stable');
  });

  it('classifies medium CV as variable', () => {
    expect(classifyByBreakpoints(0.1, DEFAULT_CONSISTENCY_SCHEME)).toBe('variable');
    expect(classifyByBreakpoints(0.15, DEFAULT_CONSISTENCY_SCHEME)).toBe('variable');
  });

  it('classifies high CV as erratic', () => {
    expect(classifyByBreakpoints(0.2, DEFAULT_CONSISTENCY_SCHEME)).toBe('erratic');
    expect(classifyByBreakpoints(0.5, DEFAULT_CONSISTENCY_SCHEME)).toBe('erratic');
  });
});

describe('DEFAULT_OUTLIER_SCHEME', () => {
  it('returns false for low z-scores', () => {
    expect(classifyByBreakpoints(0, DEFAULT_OUTLIER_SCHEME)).toBe(false);
    expect(classifyByBreakpoints(1.5, DEFAULT_OUTLIER_SCHEME)).toBe(false);
    expect(classifyByBreakpoints(1.99, DEFAULT_OUTLIER_SCHEME)).toBe(false);
  });

  it('returns true for high z-scores', () => {
    expect(classifyByBreakpoints(2.0, DEFAULT_OUTLIER_SCHEME)).toBe(true);
    expect(classifyByBreakpoints(3.0, DEFAULT_OUTLIER_SCHEME)).toBe(true);
  });
});

describe('DEFAULT_QUALITY_SCHEME', () => {
  it('classifies low ratios as poor', () => {
    expect(classifyByBreakpoints(0.5, DEFAULT_QUALITY_SCHEME)).toBe('poor');
    expect(classifyByBreakpoints(0.79, DEFAULT_QUALITY_SCHEME)).toBe('poor');
  });

  it('classifies medium ratios as warning', () => {
    expect(classifyByBreakpoints(0.8, DEFAULT_QUALITY_SCHEME)).toBe('warning');
    expect(classifyByBreakpoints(0.9, DEFAULT_QUALITY_SCHEME)).toBe('warning');
  });

  it('classifies high ratios as good', () => {
    expect(classifyByBreakpoints(0.95, DEFAULT_QUALITY_SCHEME)).toBe('good');
    expect(classifyByBreakpoints(1.0, DEFAULT_QUALITY_SCHEME)).toBe('good');
    expect(classifyByBreakpoints(1.1, DEFAULT_QUALITY_SCHEME)).toBe('good');
  });
});

describe('DEFAULT_CONFIDENCE_SCHEME', () => {
  it('classifies low sample counts as low confidence', () => {
    expect(classifyByBreakpoints(1, DEFAULT_CONFIDENCE_SCHEME)).toBe('low');
    expect(classifyByBreakpoints(4, DEFAULT_CONFIDENCE_SCHEME)).toBe('low');
  });

  it('classifies medium sample counts as medium confidence', () => {
    expect(classifyByBreakpoints(5, DEFAULT_CONFIDENCE_SCHEME)).toBe('medium');
    expect(classifyByBreakpoints(19, DEFAULT_CONFIDENCE_SCHEME)).toBe('medium');
  });

  it('classifies high sample counts as high confidence', () => {
    expect(classifyByBreakpoints(20, DEFAULT_CONFIDENCE_SCHEME)).toBe('high');
    expect(classifyByBreakpoints(100, DEFAULT_CONFIDENCE_SCHEME)).toBe('high');
  });
});
