/**
 * Tempo formatting and parsing utilities.
 *
 * Tempo is represented as "E-PB-C-PT" format — the canonical order shared with
 * `getSetTempoSeconds` (`analytics/view-model.ts`):
 * - E:  Eccentric duration (lowering)
 * - PB: Pause at bottom (after eccentric, before concentric)
 * - C:  Concentric duration (lifting)
 * - PT: Pause at top (after concentric, before eccentric)
 */

export interface TempoParts {
  eccentric: number;
  pauseBottom: number;
  concentric: number;
  pauseTop: number;
}

/** Format tempo as "E-PB-C-PT" string with whole seconds. */
export function formatTempo(parts: TempoParts): string {
  return `${Math.round(parts.eccentric)}-${Math.round(parts.pauseBottom)}-${Math.round(parts.concentric)}-${Math.round(parts.pauseTop)}`;
}

/** Parse tempo string back to parts. Returns null if invalid. */
export function parseTempo(tempo: string): TempoParts | null {
  const parts = tempo.split('-').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { eccentric: parts[0], pauseBottom: parts[1], concentric: parts[2], pauseTop: parts[3] };
}
