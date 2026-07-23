/**
 * Fatigue Verdict Tests
 *
 * Covers the NEW pieces (working-ROM standard, one-sided ROM band, directional
 * tempo combiner, strict-precedence aggregation) and the two load-bearing
 * behaviors the spec calls out: the cheat-rep precedence (velocity-ok +
 * rom-alarm → form-breakdown) and the cold-start null path.
 */
import { describe, it, expect } from 'vitest';
import {
  getSetWorkingROM,
  velocityLossTone,
  romBreakdownTone,
  tempoBreakdownTone,
  getSetFatigueVerdict,
} from '@/analytics/fatigue-verdict';
import { createSet, addSampleToSet } from '@/models/set';
import { MovementPhase } from '@/models/types';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';

// =============================================================================
// Test Helpers
// =============================================================================

interface RepSpec {
  /** Mean/peak concentric velocity magnitude (constant across the rep). */
  concVel: number;
  /** Concentric displacement (ROM). */
  rom: number;
  /** Mean eccentric velocity magnitude. Defaults to a controlled 0.5× concVel. */
  eccVel?: number;
  /** Concentric movement duration in ms. Defaults to 500. */
  concMs?: number;
}

/** Build the four samples (2 concentric, 2 eccentric) for one rep. */
function repSamples(spec: RepSpec, seq: number, t0: number): WorkoutSample[] {
  const { concVel, rom, eccVel = concVel * 0.5, concMs = 500 } = spec;
  return [
    {
      sequence: seq,
      timestamp: t0,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity: concVel,
      force: 100,
    },
    {
      sequence: seq + 1,
      timestamp: t0 + concMs,
      phase: MovementPhase.CONCENTRIC,
      position: rom,
      velocity: concVel,
      force: 100,
    },
    {
      sequence: seq + 2,
      timestamp: t0 + concMs + 100,
      phase: MovementPhase.ECCENTRIC,
      position: rom,
      velocity: eccVel,
      force: 80,
    },
    {
      sequence: seq + 3,
      timestamp: t0 + concMs + 1100,
      phase: MovementPhase.ECCENTRIC,
      position: 0,
      velocity: eccVel,
      force: 80,
    },
  ];
}

/** Build a Set from a list of rep specs, in order. */
function buildSet(specs: RepSpec[]): Set {
  let set = createSet();
  let seq = 0;
  let t = 1000;
  for (const spec of specs) {
    for (const sample of repSamples(spec, seq, t)) {
      set = addSampleToSet(set, sample);
    }
    seq += 4;
    t += (spec.concMs ?? 500) + 1500;
  }
  return set;
}

// =============================================================================
// getSetWorkingROM — trimmed peak standard (NEW)
// =============================================================================

describe('getSetWorkingROM()', () => {
  it('returns null with fewer than 3 reps (no established middle rep)', () => {
    expect(getSetWorkingROM(buildSet([{ concVel: 0.5, rom: 100 }]))).toBeNull();
    expect(
      getSetWorkingROM(
        buildSet([
          { concVel: 0.5, rom: 100 },
          { concVel: 0.5, rom: 100 },
        ])
      )
    ).toBeNull();
  });

  it('trims rep 1 (setup) and the last (in-progress/truncated) rep, then takes the peak', () => {
    // setup rep tiny, last rep truncated; the peak of the MIDDLE reps is the standard.
    const set = buildSet([
      { concVel: 0.5, rom: 10 }, // setup — trimmed
      { concVel: 0.5, rom: 100 }, // established
      { concVel: 0.5, rom: 90 }, // established
      { concVel: 0.5, rom: 5 }, // truncated close — trimmed
    ]);
    expect(getSetWorkingROM(set)).toBeCloseTo(100, 5);
  });

  it('returns null when no established middle rep has positive ROM', () => {
    const set = buildSet([
      { concVel: 0.5, rom: 50 },
      { concVel: 0.5, rom: 0 }, // the only middle rep, no ROM
      { concVel: 0.5, rom: 50 },
    ]);
    expect(getSetWorkingROM(set)).toBeNull();
  });
});

// =============================================================================
// Per-dimension resolvers
// =============================================================================

describe('velocityLossTone()', () => {
  it('is ok below the VL20 threshold', () => {
    expect(
      velocityLossTone(
        buildSet([
          { concVel: 0.5, rom: 100 },
          { concVel: 0.5, rom: 100 },
        ])
      )
    ).toBe('ok');
  });

  it('is warn in the VL20–VL30 band', () => {
    // loss = (0.5 - 0.39)/0.5 = 22%
    expect(
      velocityLossTone(
        buildSet([
          { concVel: 0.5, rom: 100 },
          { concVel: 0.39, rom: 100 },
        ])
      )
    ).toBe('warn');
  });

  it('is alarm at/above VL30', () => {
    // loss = (0.5 - 0.3)/0.5 = 40%
    expect(
      velocityLossTone(
        buildSet([
          { concVel: 0.5, rom: 100 },
          { concVel: 0.3, rom: 100 },
        ])
      )
    ).toBe('alarm');
  });
});

describe('romBreakdownTone()', () => {
  it('is ok when there is no working standard yet (short set)', () => {
    expect(
      romBreakdownTone(
        buildSet([
          { concVel: 0.5, rom: 100 },
          { concVel: 0.5, rom: 50 },
        ])
      )
    ).toBe('ok');
  });

  it('is ok at/above 0.90 of standard — including a longer-than-standard rep', () => {
    const atStandard = buildSet([
      { concVel: 0.5, rom: 100 },
      { concVel: 0.5, rom: 100 },
      { concVel: 0.5, rom: 110 }, // longer than standard → still ok (one-sided)
    ]);
    expect(romBreakdownTone(atStandard)).toBe('ok');
  });

  it('is warn between 0.75 and 0.90 of standard', () => {
    const shortish = buildSet([
      { concVel: 0.5, rom: 100 },
      { concVel: 0.5, rom: 100 },
      { concVel: 0.5, rom: 80 }, // ratio 0.80
    ]);
    expect(romBreakdownTone(shortish)).toBe('warn');
  });

  it('is alarm below 0.75 of standard', () => {
    const cut = buildSet([
      { concVel: 0.5, rom: 100 },
      { concVel: 0.5, rom: 100 },
      { concVel: 0.5, rom: 60 }, // ratio 0.60
    ]);
    expect(romBreakdownTone(cut)).toBe('alarm');
  });
});

describe('tempoBreakdownTone()', () => {
  it('is alarm when the eccentric speeds up past 30% (dropped negative)', () => {
    const dropped = buildSet([
      { concVel: 0.5, rom: 100, eccVel: 0.2 },
      { concVel: 0.5, rom: 100, eccVel: 0.25 },
      { concVel: 0.5, rom: 100, eccVel: 0.3 }, // +50% vs first
    ]);
    expect(tempoBreakdownTone(dropped)).toBe('alarm');
  });

  it('is warn when the eccentric speeds up in the 15–30% band', () => {
    const drifting = buildSet([
      { concVel: 0.5, rom: 100, eccVel: 0.2 },
      { concVel: 0.5, rom: 100, eccVel: 0.24 }, // +20% vs first
    ]);
    expect(tempoBreakdownTone(drifting)).toBe('warn');
  });

  it('caps a concentric grind at warn even when the concentric blows out', () => {
    // eccentric controlled (constant), but the last concentric is 1.8× the fastest clean rep
    const grind = buildSet([
      { concVel: 0.5, rom: 100, eccVel: 0.25, concMs: 500 },
      { concVel: 0.5, rom: 100, eccVel: 0.25, concMs: 500 },
      { concVel: 0.5, rom: 100, eccVel: 0.25, concMs: 900 }, // ratio 1.8 vs middle 0.5s
    ]);
    expect(tempoBreakdownTone(grind)).toBe('warn');
  });

  it('raises nothing for an explosive concentric with a controlled, slowing eccentric', () => {
    const clean = buildSet([
      { concVel: 0.5, rom: 100, eccVel: 0.3, concMs: 500 },
      { concVel: 0.5, rom: 100, eccVel: 0.25, concMs: 480 },
      { concVel: 0.5, rom: 100, eccVel: 0.2, concMs: 460 }, // eccentric slowing (controlled), fast concentric
    ]);
    expect(tempoBreakdownTone(clean)).toBe('ok');
  });
});

// =============================================================================
// getSetFatigueVerdict — aggregation + precedence + cold start
// =============================================================================

describe('getSetFatigueVerdict()', () => {
  it('returns null for fewer than 2 reps (cold-start null path)', () => {
    expect(getSetFatigueVerdict(createSet())).toBeNull();
    expect(getSetFatigueVerdict(buildSet([{ concVel: 0.5, rom: 100 }]))).toBeNull();
  });

  it('is Good when all three dimensions are ok', () => {
    const verdict = getSetFatigueVerdict(
      buildSet([
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 100 },
      ])
    );
    expect(verdict).toEqual({
      state: 'good',
      tone: 'ok',
      dimensions: { velocityLoss: 'ok', rom: 'ok', tempo: 'ok' },
    });
  });

  it('is Slowing when velocity is warn but ROM/tempo hold', () => {
    // loss 22% → velocity warn; ROM/tempo ok
    const verdict = getSetFatigueVerdict(
      buildSet([
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 100 },
        { concVel: 0.39, rom: 100 },
      ])
    );
    expect(verdict?.state).toBe('slowing');
    expect(verdict?.tone).toBe('warn');
    expect(verdict?.dimensions.velocityLoss).toBe('warn');
  });

  it('is Grinding when velocity is alarm but ROM/tempo still hold (deep but clean)', () => {
    // loss 40% → velocity alarm; ROM full, eccentric controlled
    const verdict = getSetFatigueVerdict(
      buildSet([
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 100 },
        { concVel: 0.3, rom: 100 },
      ])
    );
    expect(verdict?.state).toBe('grinding');
    expect(verdict?.tone).toBe('warn');
    expect(verdict?.dimensions.velocityLoss).toBe('alarm');
  });

  it('is Form breaking down when ROM alarms even though velocity is ok (the cheat rep)', () => {
    // constant velocity (loss 0 → velocity ok) but the last rep is cut to 60% of standard
    const verdict = getSetFatigueVerdict(
      buildSet([
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 60 },
      ])
    );
    expect(verdict?.state).toBe('form-breakdown');
    expect(verdict?.tone).toBe('alarm');
    expect(verdict?.dimensions.velocityLoss).toBe('ok');
    expect(verdict?.dimensions.rom).toBe('alarm');
  });

  it('is Form breaking down when the eccentric is dropped even though velocity is ok', () => {
    const verdict = getSetFatigueVerdict(
      buildSet([
        { concVel: 0.5, rom: 100, eccVel: 0.2 },
        { concVel: 0.5, rom: 100, eccVel: 0.25 },
        { concVel: 0.5, rom: 100, eccVel: 0.3 }, // +50% eccentric speed-up
      ])
    );
    expect(verdict?.state).toBe('form-breakdown');
    expect(verdict?.dimensions.velocityLoss).toBe('ok');
    expect(verdict?.dimensions.tempo).toBe('alarm');
  });

  it('is Slowing (not Form breaking down) when ROM is only warn', () => {
    const verdict = getSetFatigueVerdict(
      buildSet([
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 100 },
        { concVel: 0.5, rom: 80 }, // ratio 0.80 → warn, not alarm
      ])
    );
    expect(verdict?.state).toBe('slowing');
    expect(verdict?.dimensions.rom).toBe('warn');
  });
});
