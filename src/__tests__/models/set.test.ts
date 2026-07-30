/**
 * Set Tests
 *
 * Tests for the Set functional API.
 * The src Set model handles rep boundary detection and contains reps.
 */

import { describe, it, expect } from 'vitest';
import {
  createSet,
  addSampleToSet,
  completeSet,
  getSetRepCount,
  getSetDuration,
  getSetTimeUnderTension,
  getSetLoad,
  getSetMeanLoad,
  getSetPeakLoad,
} from '@/models/set';
import { MovementPhase } from '@/models';
import { getRepRangeOfMotion } from '@/models/rep';
import { getPhaseDuration, getPhaseRangeOfMotion } from '@/models/phase';
import type { WorkoutSample } from '@/models/sample';
import type { Set } from '@/models/set';
import type { LoadSettings } from '@/models/load';

// =============================================================================
// Test Helpers
// =============================================================================

function createSampleSequence(phases: { phase: MovementPhase; count: number }[]): WorkoutSample[] {
  const samples: WorkoutSample[] = [];
  let sequence = 0;
  let timestamp = 1000;

  for (const { phase, count } of phases) {
    for (let i = 0; i < count; i++) {
      samples.push({
        sequence: sequence++,
        timestamp,
        phase,
        position: phase === MovementPhase.CONCENTRIC ? i / count : 1 - i / count,
        velocity: phase === MovementPhase.IDLE ? 0 : 0.5,
        force: 100,
      });
      timestamp += 90;
    }
  }

  return samples;
}

function processSamples(samples: WorkoutSample[]): Set {
  let set = createSet();
  for (const sample of samples) {
    set = addSampleToSet(set, sample);
  }
  return set;
}

// =============================================================================
// createSet() Tests
// =============================================================================

describe('createSet()', () => {
  it('creates empty set', () => {
    const set = createSet();

    expect(set.reps).toEqual([]);
    expect(getSetRepCount(set)).toBe(0);
  });
});

// =============================================================================
// addSampleToSet() Tests
// =============================================================================

describe('addSampleToSet()', () => {
  describe('starting a new rep', () => {
    it('starts rep on CONCENTRIC sample', () => {
      const set = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      };

      const result = addSampleToSet(set, sample);

      expect(result.reps.length).toBe(1);
      expect(result.reps[0].repNumber).toBe(1);
    });

    it('ignores non-CONCENTRIC samples when no rep in progress', () => {
      const set = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.IDLE,
        position: 0,
        velocity: 0,
        force: 0,
      };

      const result = addSampleToSet(set, sample);

      expect(result.reps.length).toBe(0);
    });

    it('ignores ECCENTRIC samples when no rep in progress', () => {
      const set = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: 0.3,
        force: 100,
      };

      const result = addSampleToSet(set, sample);

      expect(result.reps.length).toBe(0);
    });
  });

  describe('external rep boundaries (repBoundary option)', () => {
    const conc = (seq: number): WorkoutSample => ({
      sequence: seq,
      timestamp: 1000 + seq * 90,
      phase: MovementPhase.CONCENTRIC,
      position: 0,
      velocity: 0.5,
      force: 100,
    });

    it('repBoundary:true forces a new rep without an eccentric→concentric transition', () => {
      // Two CONCENTRIC-only samples: internal detection would keep them in one
      // rep, but an explicit boundary on the 2nd starts rep 2.
      let set = createSet();
      set = addSampleToSet(set, conc(0), { repBoundary: true });
      set = addSampleToSet(set, conc(1), { repBoundary: true });
      expect(set.reps.map((r) => r.repNumber)).toEqual([1, 2]);
    });

    it('repBoundary:false keeps samples in the current rep across a phase transition', () => {
      // A real eccentric→concentric transition that internal detection WOULD
      // split — suppressed by an explicit false so the firmware owns boundaries.
      let set = createSet();
      set = addSampleToSet(set, conc(0)); // rep 1 (default)
      set = addSampleToSet(set, { ...conc(1), phase: MovementPhase.ECCENTRIC, position: 1 });
      set = addSampleToSet(set, conc(2), { repBoundary: false }); // would-be new rep, pinned
      expect(set.reps.length).toBe(1);
    });

    it('repBoundary:true starts the first rep even on a non-concentric sample', () => {
      let set = createSet();
      set = addSampleToSet(
        set,
        { ...conc(0), phase: MovementPhase.ECCENTRIC, position: 1 },
        { repBoundary: true }
      );
      expect(set.reps.map((r) => r.repNumber)).toEqual([1]);
    });

    it('repBoundary:false drops samples before the first rep', () => {
      let set = createSet();
      set = addSampleToSet(set, conc(0), { repBoundary: false });
      expect(set.reps.length).toBe(0);
    });

    it('undefined repBoundary is identical to the default internal detection', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 3 },
        { phase: MovementPhase.ECCENTRIC, count: 3 },
        { phase: MovementPhase.CONCENTRIC, count: 3 },
        { phase: MovementPhase.ECCENTRIC, count: 3 },
      ]);
      let withEmptyOptions = createSet();
      let withoutOption = createSet();
      for (const s of samples) {
        withEmptyOptions = addSampleToSet(withEmptyOptions, s, {});
        withoutOption = addSampleToSet(withoutOption, s);
      }
      expect(withEmptyOptions).toEqual(withoutOption);
      expect(withoutOption.reps.length).toBe(2);
    });

    it('drives rep count purely from firmware boundaries regardless of phase pattern', () => {
      // Firmware asserts 3 rep starts across a noisy/irregular phase stream.
      let set = createSet();
      const seq = [
        { s: conc(0), b: true }, // rep 1
        { s: { ...conc(1), phase: MovementPhase.ECCENTRIC }, b: false },
        { s: { ...conc(2), phase: MovementPhase.CONCENTRIC }, b: true }, // rep 2
        { s: { ...conc(3), phase: MovementPhase.IDLE }, b: false },
        { s: { ...conc(4), phase: MovementPhase.CONCENTRIC }, b: true }, // rep 3
      ];
      for (const { s, b } of seq) {
        set = addSampleToSet(set, s, { repBoundary: b });
      }
      expect(set.reps.map((r) => r.repNumber)).toEqual([1, 2, 3]);
    });
  });

  describe('full rep cycle', () => {
    it('builds rep with concentric and eccentric phases', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      expect(set.reps.length).toBe(1);
      expect(set.reps[0].concentric.samples.length).toBe(5);
      expect(set.reps[0].eccentric.samples.length).toBe(5);
    });

    it('includes hold samples in appropriate phase', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.HOLD, count: 2 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      expect(set.reps.length).toBe(1);
      // Hold samples before eccentric go to concentric phase
      expect(set.reps[0].concentric.samples.length).toBe(7);
      expect(set.reps[0].eccentric.samples.length).toBe(5);
    });
  });

  describe('multiple consecutive reps', () => {
    it('detects new rep on eccentric -> concentric transition', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
        { phase: MovementPhase.CONCENTRIC, count: 5 }, // New rep starts here
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      expect(set.reps.length).toBe(2);
      expect(set.reps[0].repNumber).toBe(1);
      expect(set.reps[1].repNumber).toBe(2);
    });

    it('maintains correct rep numbers across multiple reps', () => {
      const samples: WorkoutSample[] = [];
      for (let rep = 0; rep < 3; rep++) {
        samples.push(
          ...createSampleSequence([
            { phase: MovementPhase.CONCENTRIC, count: 5 },
            { phase: MovementPhase.ECCENTRIC, count: 5 },
          ])
        );
      }

      const set = processSamples(samples);

      expect(set.reps.length).toBe(3);
      expect(set.reps[0].repNumber).toBe(1);
      expect(set.reps[1].repNumber).toBe(2);
      expect(set.reps[2].repNumber).toBe(3);
    });

    it('handles IDLE between reps', () => {
      const samples = createSampleSequence([
        { phase: MovementPhase.CONCENTRIC, count: 5 },
        { phase: MovementPhase.ECCENTRIC, count: 5 },
        { phase: MovementPhase.IDLE, count: 3 }, // Rest between reps
        { phase: MovementPhase.CONCENTRIC, count: 5 }, // New rep
        { phase: MovementPhase.ECCENTRIC, count: 5 },
      ]);

      const set = processSamples(samples);

      // IDLE samples after eccentric still go to that rep's eccentric phase
      expect(set.reps.length).toBe(2);
    });
  });

  describe('immutability', () => {
    it('returns new set object', () => {
      const set1 = createSet();
      const sample: WorkoutSample = {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      };

      const set2 = addSampleToSet(set1, sample);

      expect(set1).not.toBe(set2);
      expect(set1.reps.length).toBe(0);
      expect(set2.reps.length).toBe(1);
    });
  });
});

// =============================================================================
// completeSet() Tests
// =============================================================================

describe('completeSet()', () => {
  it('trims trailing IDLE from last rep eccentric phase', () => {
    const samples = createSampleSequence([
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.ECCENTRIC, count: 5 },
      { phase: MovementPhase.IDLE, count: 10 }, // Trailing IDLE
    ]);

    let set = processSamples(samples);
    set = completeSet(set);

    // IDLE samples should be trimmed from eccentric phase
    expect(set.reps[0].eccentric.samples.length).toBe(5);
  });

  it('trims trailing IDLE from last rep concentric phase if no eccentric', () => {
    const samples = createSampleSequence([
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.IDLE, count: 10 }, // Trailing IDLE, no eccentric yet
    ]);

    let set = processSamples(samples);
    set = completeSet(set);

    // IDLE samples should be trimmed from concentric phase
    expect(set.reps[0].concentric.samples.length).toBe(5);
  });

  it('returns same set if no reps', () => {
    const set = createSet();
    const completed = completeSet(set);

    expect(completed).toBe(set);
  });

  describe('rep 1 pre-lift engagement artifact (WA-rep1-segmentation)', () => {
    /**
     * Builds an explicit timestamp/position/velocity/phase sample sequence
     * (unlike `createSampleSequence`, which derives position purely from
     * index within a phase and can't express a low-displacement "jitter"
     * prefix followed by real travel).
     */
    function buildSamples(
      entries: { phase: MovementPhase; position: number; velocity: number }[]
    ): WorkoutSample[] {
      return entries.map((entry, i) => ({
        sequence: i,
        timestamp: 1000 + i * 90,
        phase: entry.phase,
        position: entry.position,
        velocity: entry.velocity,
        force: 100,
      }));
    }

    // Cable-engagement jitter: tagged CONCENTRIC (nonzero velocity) but net
    // displacement never leaves a ~1cm band -- below the 2cm real-motion floor.
    const artifactPrefix = [
      { phase: MovementPhase.CONCENTRIC, position: 0, velocity: 0.05 },
      { phase: MovementPhase.CONCENTRIC, position: 0.005, velocity: 0.06 },
      { phase: MovementPhase.CONCENTRIC, position: 0.01, velocity: 0.04 },
      { phase: MovementPhase.CONCENTRIC, position: 0.003, velocity: 0.05 },
      { phase: MovementPhase.CONCENTRIC, position: 0.008, velocity: 0.05 },
      { phase: MovementPhase.CONCENTRIC, position: 0.0, velocity: 0.05 },
    ];

    // Real concentric drive: 0 -> 0.5m over 10 samples.
    const realConcentric = Array.from({ length: 10 }, (_, i) => ({
      phase: MovementPhase.CONCENTRIC,
      position: (i + 1) * 0.05,
      velocity: 0.5,
    }));

    const eccentric = Array.from({ length: 10 }, (_, i) => ({
      phase: MovementPhase.ECCENTRIC,
      position: 0.5 - (i + 1) * 0.05,
      velocity: 0.5,
    }));

    it('reproduces the bug: rep 1 concentric span is inflated before the fix runs', () => {
      const samples = buildSamples([...artifactPrefix, ...realConcentric, ...eccentric]);
      const set = processSamples(samples);
      const rep1 = set.reps[0];

      // Pre-completeSet(), the artifact prefix is still part of the phase --
      // this is the bug: all 16 samples (6 artifact + 10 real) are attributed
      // to rep 1's concentric span, and its ROM includes the artifact's tiny
      // net displacement even though the real drive alone spans 0.5m.
      expect(rep1.concentric.samples.length).toBe(16);
      expect(getPhaseRangeOfMotion(rep1.concentric)).toBeCloseTo(0.5, 5);
      // Span includes the artifact's leading samples (indices 0-5) through
      // the real drive's last sample (index 15): 15 intervals * 90ms.
      expect(getPhaseDuration(rep1.concentric)).toBeCloseTo((15 * 90) / 1000, 5);
    });

    it('fixes rep 1: completeSet() excludes the pre-lift artifact from the concentric span', () => {
      const samples = buildSamples([...artifactPrefix, ...realConcentric, ...eccentric]);
      let set = processSamples(samples);
      set = completeSet(set);
      const rep1 = set.reps[0];

      // Only the 10 real-drive samples remain in rep 1's concentric phase.
      expect(rep1.concentric.samples.length).toBe(10);
      // Real drive spans 0.05m -> 0.5m (0.45m), not the artifact-inflated 0.5m.
      expect(getRepRangeOfMotion(rep1)).toBeCloseTo(0.45, 5);
      // Span now covers only the 10 real-drive samples (9 intervals * 90ms),
      // no longer inflated by the artifact's leading ~540ms.
      expect(getPhaseDuration(rep1.concentric)).toBeCloseTo((9 * 90) / 1000, 5);
    });

    it('does not truncate a rep 1 with a clean start (no regression)', () => {
      const samples = buildSamples([...realConcentric, ...eccentric]);
      let set = processSamples(samples);
      set = completeSet(set);
      const rep1 = set.reps[0];

      expect(rep1.concentric.samples.length).toBe(10);
      expect(getRepRangeOfMotion(rep1)).toBeCloseTo(0.45, 5);
    });

    it('leaves rep 2+ concentric phases untouched even when rep 1 had an artifact', () => {
      const rep1Samples = [...artifactPrefix, ...realConcentric, ...eccentric];
      const rep2Samples = [...realConcentric, ...eccentric];
      const samples = buildSamples([...rep1Samples, ...rep2Samples]);

      let set = processSamples(samples);
      set = completeSet(set);

      expect(set.reps.length).toBe(2);
      expect(set.reps[0].concentric.samples.length).toBe(10);
      expect(set.reps[1].concentric.samples.length).toBe(10);
      expect(getRepRangeOfMotion(set.reps[0])).toBeCloseTo(0.45, 5);
      expect(getRepRangeOfMotion(set.reps[1])).toBeCloseTo(0.45, 5);
    });
  });
});

// =============================================================================
// Set Metrics Tests
// =============================================================================

describe('Set metrics', () => {
  it('calculates rep count', () => {
    const samples = createSampleSequence([
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.ECCENTRIC, count: 5 },
      { phase: MovementPhase.CONCENTRIC, count: 5 },
      { phase: MovementPhase.ECCENTRIC, count: 5 },
    ]);

    const set = processSamples(samples);

    expect(getSetRepCount(set)).toBe(2);
  });

  it('calculates total duration', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 2000,
        phase: MovementPhase.CONCENTRIC,
        position: 1,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 2,
        timestamp: 2500,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: 0.3,
        force: 100,
      },
      {
        sequence: 3,
        timestamp: 4000,
        phase: MovementPhase.ECCENTRIC,
        position: 0,
        velocity: 0.3,
        force: 100,
      },
    ];

    const set = processSamples(samples);

    // Total duration: (2000-1000) + (4000-2500) = 1000 + 1500 = 2500ms = 2.5s
    // But getRepDuration uses endTime - startTime of rep
    expect(getSetDuration(set)).toBeGreaterThan(0);
  });

  it('calculates time under tension', () => {
    const samples: WorkoutSample[] = [
      {
        sequence: 0,
        timestamp: 1000,
        phase: MovementPhase.CONCENTRIC,
        position: 0,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 1,
        timestamp: 2000,
        phase: MovementPhase.CONCENTRIC,
        position: 1,
        velocity: 0.5,
        force: 100,
      },
      {
        sequence: 2,
        timestamp: 2500,
        phase: MovementPhase.ECCENTRIC,
        position: 1,
        velocity: 0.3,
        force: 100,
      },
      {
        sequence: 3,
        timestamp: 4000,
        phase: MovementPhase.ECCENTRIC,
        position: 0,
        velocity: 0.3,
        force: 100,
      },
    ];

    const set = processSamples(samples);

    // TUT should be sum of movement durations
    expect(getSetTimeUnderTension(set)).toBeGreaterThan(0);
  });

  it('returns 0 for empty set metrics', () => {
    const set = createSet();

    expect(getSetRepCount(set)).toBe(0);
    expect(getSetDuration(set)).toBe(0);
    expect(getSetTimeUnderTension(set)).toBe(0);
  });
});

// =============================================================================
// Load Helper Tests
// =============================================================================

/** Build a single sample carrying an explicit `load` value. */
function loadedSample(
  sequence: number,
  timestamp: number,
  phase: MovementPhase,
  position: number,
  load?: number
): WorkoutSample {
  return {
    sequence,
    timestamp,
    phase,
    position,
    velocity: phase === MovementPhase.IDLE ? 0 : 0.5,
    force: 100,
    load,
  };
}

describe('getSetLoad()', () => {
  it('returns 0 when the set has no loadSettings', () => {
    const set = createSet();

    expect(getSetLoad(set)).toBe(0);
  });

  it('returns the base weight from loadSettings, ignoring chains and eccentric', () => {
    const loadSettings: LoadSettings = {
      weight: 135,
      chains: 20,
      eccentric: 10,
      chainsFullExtension: 0.6,
    };
    const set = createSet(loadSettings);

    expect(getSetLoad(set)).toBe(135);
  });
});

describe('getSetMeanLoad()', () => {
  it('returns 0 for a set with no reps', () => {
    const set = createSet();

    expect(getSetMeanLoad(set)).toBe(0);
  });

  it('returns 0 when reps exist but samples carry no load data', () => {
    let set = createSet();
    set = addSampleToSet(set, loadedSample(0, 1000, MovementPhase.CONCENTRIC, 0, undefined));
    set = addSampleToSet(set, loadedSample(1, 1090, MovementPhase.CONCENTRIC, 1, undefined));
    set = addSampleToSet(set, loadedSample(2, 1180, MovementPhase.ECCENTRIC, 1, undefined));

    expect(getSetMeanLoad(set)).toBe(0);
  });

  it('averages per-rep concentric mean load across all reps', () => {
    let set = createSet();
    // Rep 1: concentric loads 100, 200 -> mean 150
    set = addSampleToSet(set, loadedSample(0, 1000, MovementPhase.CONCENTRIC, 0, 100));
    set = addSampleToSet(set, loadedSample(1, 1090, MovementPhase.CONCENTRIC, 1, 200));
    set = addSampleToSet(set, loadedSample(2, 1180, MovementPhase.ECCENTRIC, 1, 999)); // eccentric ignored by mean
    // Rep 2 (new rep on eccentric -> concentric transition): concentric loads 50, 50 -> mean 50
    set = addSampleToSet(set, loadedSample(3, 1270, MovementPhase.CONCENTRIC, 0, 50));
    set = addSampleToSet(set, loadedSample(4, 1360, MovementPhase.CONCENTRIC, 1, 50));

    // (150 + 50) / 2 == 100
    expect(getSetMeanLoad(set)).toBe(100);
  });
});

describe('getSetPeakLoad()', () => {
  it('returns 0 for a set with no reps', () => {
    const set = createSet();

    expect(getSetPeakLoad(set)).toBe(0);
  });

  it('returns 0 when reps exist but samples carry no load data', () => {
    let set = createSet();
    set = addSampleToSet(set, loadedSample(0, 1000, MovementPhase.CONCENTRIC, 0, undefined));
    set = addSampleToSet(set, loadedSample(1, 1090, MovementPhase.ECCENTRIC, 1, undefined));

    expect(getSetPeakLoad(set)).toBe(0);
  });

  it('takes the max across both concentric and eccentric phases, and across reps', () => {
    let set = createSet();
    // Rep 1: concentric peak 120, eccentric peak 300
    set = addSampleToSet(set, loadedSample(0, 1000, MovementPhase.CONCENTRIC, 0, 120));
    set = addSampleToSet(set, loadedSample(1, 1090, MovementPhase.ECCENTRIC, 1, 300));
    // Rep 2: concentric peak 400 (new max), eccentric peak 60
    set = addSampleToSet(set, loadedSample(2, 1180, MovementPhase.CONCENTRIC, 0, 400));
    set = addSampleToSet(set, loadedSample(3, 1270, MovementPhase.ECCENTRIC, 1, 60));

    expect(getSetPeakLoad(set)).toBe(400);
  });
});
