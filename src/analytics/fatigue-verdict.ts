/**
 * Live fatigue verdict — the always-on, one-glance read of how a set is going.
 *
 * Composes existing WA math into a single aggregated verdict on a spectrum
 * (Good → Slowing → Grinding → Form breaking down) plus three per-dimension
 * status lights (velocity-loss · ROM-breakdown · tempo-breakdown), each
 * `ok | warn | alarm`.
 *
 * The one insight the aggregation protects: velocity alone can read FINE while
 * form fails — a *cheat rep* props velocity up by cutting ROM and dropping the
 * eccentric. So this is NOT "worst of three with velocity dominant": ROM/tempo
 * alarms OVERRIDE a healthy-looking velocity into "Form breaking down" via strict
 * precedence (§3 of the spec).
 *
 * Works in two framings with one function: LIVE (in-progress set — reference is
 * best-so-far, the latest rep is "current") and REVIEW (completed set). Because
 * the reused primitives already use best/peak references (not first-rep), the same
 * call serves both — see `getSetVelocityLossPct` and the working-ROM standard.
 *
 * This module reads WA models only (no protocol bytes / frames / command codes),
 * same NDA posture as `view-model.ts`. It ADDS a thin pure layer; it does not
 * modify the primitives it composes.
 *
 * Spec: `voltras-workspace/coordination/design-explorations/fatigue-verdict-spec.md`.
 */
import type { Set } from '@/models/set';
import { getPhaseMovementDuration } from '@/models/phase';
import {
  getSetVelocityLossPct,
  getSetLastRepROM,
  getSetRepROMs,
  getSetEccentricVelocityChangePct,
} from '@/analytics/set-analytics';
import { velocityLossVerdict } from '@/analytics/view-model';
import { type BreakpointScheme, classifyByBreakpoints } from '@/stats/schemes';

// =============================================================================
// Types
// =============================================================================

/** Per-dimension status light. Tone is WA's; labels/colors are the consumer's. */
export type DimensionTone = 'ok' | 'warn' | 'alarm';

/**
 * The aggregated verdict state (drives the label). Four states, three tones:
 * `slowing` and `grinding` both render `warn` but carry different coaching reads
 * (push-with-awareness vs at-the-limit-still-clean).
 */
export type FatigueVerdictState = 'good' | 'slowing' | 'grinding' | 'form-breakdown';

/**
 * The always-on verdict for a set. `dimensions` always exposes which dimension
 * drove the state, so a generic `warn` is never ambiguous on the card.
 */
export interface FatigueVerdict {
  /** Verdict state — drives the label. */
  state: FatigueVerdictState;
  /** Aggregate tone — drives the card color. */
  tone: DimensionTone;
  /** The three per-dimension lights that produced the state. */
  dimensions: {
    velocityLoss: DimensionTone;
    rom: DimensionTone;
    tempo: DimensionTone;
  };
}

/**
 * Configurable cut-points. All default to the §2 spec values. WA owns the
 * thresholds; consumers own the presentation. These are goal-dependent knobs
 * (§5): strength-speed work stops earlier, endurance later, and ROM/tempo edges
 * want per-exercise tuning on real sets.
 */
export interface FatigueVerdictSchemes {
  /** One-sided ROM band (short is bad, long is neutral). Ratio = current / working-standard. */
  rom?: BreakpointScheme<DimensionTone>;
  /** Eccentric-control band on eccentric velocity change % (speeding up = worse). */
  eccentric?: BreakpointScheme<DimensionTone>;
  /** Concentric-grind band on concentric-time ratio (current / fastest clean rep). Capped at `warn`. */
  concentric?: BreakpointScheme<'ok' | 'warn'>;
}

// =============================================================================
// Default schemes (§2)
// =============================================================================

/**
 * ROM breakdown — ONE-SIDED (short is bad, long is neutral). Ratio =
 * current-rep ROM / working-standard.
 *   alarm: ratio < 0.75 (cut considerably short)
 *   warn : 0.75 ≤ ratio < 0.90 (a bit short)
 *   ok   : ratio ≥ 0.90, INCLUDING ratio > 1.0 (a longer-than-standard rep raises nothing).
 * This asymmetry is the difference from the symmetric `assessRepROM` (`quality.ts`).
 */
export const DEFAULT_ROM_BREAKDOWN_SCHEME: BreakpointScheme<DimensionTone> = {
  breakpoints: [
    { below: 0.75, value: 'alarm' },
    { below: 0.9, value: 'warn' },
  ],
  fallback: 'ok',
};

/**
 * Eccentric control — a fast / dropped negative is a LOSS OF CONTROL and can
 * reach `alarm`. Banded on eccentric velocity change % (positive = speeding up).
 *   ok   : ≤ 15%
 *   warn : 15–30%
 *   alarm: > 30% (dropping the negative)
 * The 30% edge matches `getSetFormWarning`'s existing fire point
 * (controlScore < 40 ⇔ changePct > 30, `fatigue.ts`).
 */
export const DEFAULT_ECCENTRIC_BREAKDOWN_SCHEME: BreakpointScheme<DimensionTone> = {
  breakpoints: [
    { below: 15, value: 'ok' },
    { below: 30, value: 'warn' },
  ],
  fallback: 'alarm',
};

/**
 * Concentric grind — a slow / effortful concentric is MILD fatigue, CAPPED at
 * `warn` (grinding is a fatigue tell, not a form failure). Banded on the ratio of
 * the current rep's concentric time to the fastest clean rep's.
 *   ok   : ratio < 1.5
 *   warn : ratio ≥ 1.5 (concentric ≥ 50% longer than the athlete's fastest clean rep)
 */
export const DEFAULT_CONCENTRIC_GRIND_SCHEME: BreakpointScheme<'ok' | 'warn'> = {
  breakpoints: [{ below: 1.5, value: 'ok' }],
  fallback: 'warn',
};

// =============================================================================
// Working-ROM standard (NEW) — trimmed peak, mirrors the peak-velocity baseline
// =============================================================================

/**
 * The set's working ROM standard: the robust peak ROM used as the reference a
 * current rep is judged against. Mirrors how peak (not first-rep) velocity is the
 * velocity-loss reference — rep 1 is a cable-engagement artifact with a tiny ROM,
 * and the last rep may be in-progress or truncated at set close, so BOTH are
 * trimmed before taking the peak of the remaining (established) reps.
 *
 * Contrast `getSetBestROM` (`set-analytics.ts`), the naive max over ALL reps
 * (which the setup rep and a truncated close rep can distort in either direction).
 *
 * Returns `null` when there is no established middle rep to build a standard from
 * (fewer than 3 reps, or all middle ROMs non-positive): the ROM dimension then
 * raises nothing rather than judging against a fabricated standard. Consequently
 * the earliest a ROM alarm can fire is rep 3 (judging rep 3 against rep 2).
 *
 * Trim policy (first + last) and peak-vs-median are open calibration knobs (§5).
 */
export function getSetWorkingROM(set: Set): number | null {
  const roms = getSetRepROMs(set);
  if (roms.length < 3) return null;
  const established = roms.slice(1, -1).filter((rom) => rom > 0);
  if (established.length === 0) return null;
  return Math.max(...established);
}

// =============================================================================
// Per-dimension resolvers
// =============================================================================

const TONE_RANK: Record<DimensionTone, number> = { ok: 0, warn: 1, alarm: 2 };

/** The worse (higher-rank) of two tones. */
function maxTone(a: DimensionTone, b: DimensionTone): DimensionTone {
  return TONE_RANK[a] >= TONE_RANK[b] ? a : b;
}

const VELOCITY_LOSS_TONE: Record<'productive' | 'threshold' | 'stop', DimensionTone> = {
  productive: 'ok',
  threshold: 'warn',
  stop: 'alarm',
};

/**
 * Velocity-loss dimension — 100% reuse. `getSetVelocityLossPct` (best-so-far →
 * current) banded by the canonical `velocityLossVerdict` (VL20/VL30), mapped
 * productive→ok / threshold→warn / stop→alarm.
 */
export function velocityLossTone(set: Set): DimensionTone {
  return VELOCITY_LOSS_TONE[velocityLossVerdict(getSetVelocityLossPct(set))];
}

/**
 * ROM-breakdown dimension — current-rep ROM vs the trimmed working standard,
 * one-sided band. Returns `ok` when there is no standard yet (cold / short set)
 * or the current rep carries no ROM — never fabricate an alarm from missing data.
 */
export function romBreakdownTone(
  set: Set,
  scheme: BreakpointScheme<DimensionTone> = DEFAULT_ROM_BREAKDOWN_SCHEME
): DimensionTone {
  const standard = getSetWorkingROM(set);
  if (standard === null || standard <= 0) return 'ok';
  const current = getSetLastRepROM(set);
  if (current <= 0) return 'ok';
  return classifyByBreakpoints(current / standard, scheme);
}

/**
 * The fastest (minimum positive) concentric movement time among ESTABLISHED reps
 * — the grind reference, built the same way as the working-ROM standard (trim the
 * setup rep 1 and the in-progress/last rep). `null` when none is available.
 */
function fastestConcentricTime(set: Set): number | null {
  if (set.reps.length < 3) return null;
  const established = set.reps
    .slice(1, -1)
    .map((rep) => getPhaseMovementDuration(rep.concentric))
    .filter((t) => t > 0);
  if (established.length === 0) return null;
  return Math.min(...established);
}

/**
 * Concentric-grind sub-tone — capped at `warn`. Current rep's concentric time vs
 * the fastest clean rep; a long grind is a fatigue tell, never a form failure.
 * Returns `ok` when there is no reference yet or the current concentric is empty.
 */
function concentricGrindTone(
  set: Set,
  scheme: BreakpointScheme<'ok' | 'warn'> = DEFAULT_CONCENTRIC_GRIND_SCHEME
): 'ok' | 'warn' {
  const fastest = fastestConcentricTime(set);
  if (fastest === null || fastest <= 0) return 'ok';
  const lastRep = set.reps.at(-1);
  if (!lastRep) return 'ok';
  const current = getPhaseMovementDuration(lastRep.concentric);
  if (current <= 0) return 'ok';
  return classifyByBreakpoints(current / fastest, scheme);
}

/**
 * Tempo-breakdown dimension — DIRECTIONAL. Two sub-signals, take the worse, but
 * the concentric side is capped at `warn`:
 *   - eccentric control (fast/dropped negative = loss of control = SEVERE) → up to `alarm`
 *   - concentric grind (slow/effortful concentric = MILD fatigue)          → `warn` max
 * So an explosive concentric with a slow, controlled eccentric raises nothing.
 */
export function tempoBreakdownTone(set: Set, schemes?: FatigueVerdictSchemes): DimensionTone {
  const eccScheme = schemes?.eccentric ?? DEFAULT_ECCENTRIC_BREAKDOWN_SCHEME;
  const concScheme = schemes?.concentric ?? DEFAULT_CONCENTRIC_GRIND_SCHEME;
  const eccTone = classifyByBreakpoints(getSetEccentricVelocityChangePct(set), eccScheme);
  const concTone = concentricGrindTone(set, concScheme);
  return maxTone(eccTone, concTone);
}

// =============================================================================
// Aggregation (§3 — strict precedence, first match wins)
// =============================================================================

/**
 * The always-on fatigue verdict for a set.
 *
 * COLD START: returns `null` for fewer than two reps — mirroring
 * `estimateSetRpe`'s `<2 reps → null` gate. There is no baseline yet (velocity
 * loss, ROM, and tempo standards are all undefined), so the honest signal is
 * "no verdict"; the consuming card renders a neutral "warming up" for a `null`
 * verdict rather than a fabricated Good/alarm.
 *
 * Otherwise resolves the three dimension tones and applies STRICT PRECEDENCE.
 * ROM/tempo alarms are checked BEFORE velocity, so a clean-looking velocity
 * cannot mask a cheat rep:
 *   1. rom == alarm OR tempo == alarm      → Form breaking down (alarm)
 *   2. velocityLoss == alarm               → Grinding (warn)   [deep but clean]
 *   3. any dimension == warn               → Slowing (warn)    [honest fatigue]
 *   4. all ok                              → Good (ok)
 */
export function getSetFatigueVerdict(
  set: Set,
  schemes?: FatigueVerdictSchemes
): FatigueVerdict | null {
  if (set.reps.length < 2) return null;

  const dimensions = {
    velocityLoss: velocityLossTone(set),
    rom: romBreakdownTone(set, schemes?.rom),
    tempo: tempoBreakdownTone(set, schemes),
  };

  const { velocityLoss, rom, tempo } = dimensions;

  if (rom === 'alarm' || tempo === 'alarm') {
    return { state: 'form-breakdown', tone: 'alarm', dimensions };
  }
  if (velocityLoss === 'alarm') {
    return { state: 'grinding', tone: 'warn', dimensions };
  }
  if (velocityLoss === 'warn' || rom === 'warn' || tempo === 'warn') {
    return { state: 'slowing', tone: 'warn', dimensions };
  }
  return { state: 'good', tone: 'ok', dimensions };
}
