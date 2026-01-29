/**
 * Tempo formatting and parsing utilities.
 *
 * Tempo is represented as "E-HT-C-HB" format:
 * - E: Eccentric duration (lowering)
 * - HT: Hold at top (after concentric, before eccentric)
 * - C: Concentric duration (lifting)
 * - HB: Hold at bottom (after eccentric)
 */

export interface TempoParts {
  eccentric: number;
  holdTop: number;
  concentric: number;
  holdBottom: number;
}

/** Format tempo as "E-HT-C-HB" string with whole seconds. */
export function formatTempo(parts: TempoParts): string {
  return `${Math.round(parts.eccentric)}-${Math.round(parts.holdTop)}-${Math.round(parts.concentric)}-${Math.round(parts.holdBottom)}`;
}

/** Parse tempo string back to parts. Returns null if invalid. */
export function parseTempo(tempo: string): TempoParts | null {
  const parts = tempo.split('-').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { eccentric: parts[0], holdTop: parts[1], concentric: parts[2], holdBottom: parts[3] };
}
