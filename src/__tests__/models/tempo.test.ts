/**
 * Tempo Tests
 *
 * Tests for tempo formatting/parsing ("E-PB-C-PT" string format — canonical
 * order [eccentric, pauseBottom, concentric, pauseTop]), including round-trip
 * fidelity and invalid-input handling.
 */

import { describe, it, expect } from 'vitest';
import { formatTempo, parseTempo } from '@/models/tempo';
import type { TempoParts } from '@/models/tempo';

// =============================================================================
// formatTempo()
// =============================================================================

describe('formatTempo()', () => {
  it('formats whole-second parts as "E-PB-C-PT"', () => {
    const parts: TempoParts = { eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 };

    expect(formatTempo(parts)).toBe('3-1-2-0');
  });

  it('rounds fractional seconds to the nearest whole second', () => {
    const parts: TempoParts = { eccentric: 3.6, pauseBottom: 1.4, concentric: 2.5, pauseTop: 0.49 };

    // Math.round: 3.6 -> 4, 1.4 -> 1, 2.5 -> 3 (round-half-up), 0.49 -> 0
    expect(formatTempo(parts)).toBe('4-1-3-0');
  });

  it('formats all-zero tempo', () => {
    const parts: TempoParts = { eccentric: 0, pauseBottom: 0, concentric: 0, pauseTop: 0 };

    expect(formatTempo(parts)).toBe('0-0-0-0');
  });
});

// =============================================================================
// parseTempo()
// =============================================================================

describe('parseTempo()', () => {
  describe('valid input', () => {
    it('parses a well-formed tempo string into parts', () => {
      const result = parseTempo('3-1-2-0');

      expect(result).toEqual({ eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 });
    });

    it('parses an all-zero tempo string', () => {
      const result = parseTempo('0-0-0-0');

      expect(result).toEqual({ eccentric: 0, pauseBottom: 0, concentric: 0, pauseTop: 0 });
    });

    it('parses multi-digit segments', () => {
      const result = parseTempo('10-15-20-25');

      expect(result).toEqual({ eccentric: 10, pauseBottom: 15, concentric: 20, pauseTop: 25 });
    });
  });

  describe('invalid input', () => {
    it('returns null for too few segments', () => {
      expect(parseTempo('1-2-3')).toBeNull();
    });

    it('returns null for too many segments', () => {
      expect(parseTempo('1-2-3-4-5')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseTempo('')).toBeNull();
    });

    it('returns null when a segment is non-numeric', () => {
      expect(parseTempo('a-2-3-4')).toBeNull();
    });

    it('returns null when a segment contains non-numeric characters mixed with digits', () => {
      expect(parseTempo('1-2x-3-4')).toBeNull();
    });

    it('treats an empty segment as 0 (Number("") coerces to 0, not NaN)', () => {
      // Documents actual behavior: a double dash produces an empty segment,
      // which Number() coerces to 0 rather than NaN, so it parses successfully.
      const result = parseTempo('1--3-4');

      expect(result).toEqual({ eccentric: 1, pauseBottom: 0, concentric: 3, pauseTop: 4 });
    });
  });

  describe('round-trip', () => {
    it('round-trips formatTempo output back to equivalent parts', () => {
      const original: TempoParts = { eccentric: 4, pauseBottom: 2, concentric: 1, pauseTop: 3 };

      const roundTripped = parseTempo(formatTempo(original));

      expect(roundTripped).toEqual(original);
    });

    it('round-trips through rounding for fractional inputs', () => {
      const original: TempoParts = {
        eccentric: 2.6,
        pauseBottom: 0.2,
        concentric: 1.5,
        pauseTop: 3.5,
      };

      const roundTripped = parseTempo(formatTempo(original));

      // Values are rounded during formatting, so the round-trip reflects rounded seconds.
      expect(roundTripped).toEqual({ eccentric: 3, pauseBottom: 0, concentric: 2, pauseTop: 4 });
    });
  });
});
