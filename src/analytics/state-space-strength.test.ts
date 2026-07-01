import { describe, it, expect } from 'vitest';
import { StateSpaceStrengthModel, DEFAULT_OBSERVATION_NOISE } from './state-space-strength';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Feed a sequence of observations and return the final state. */
function feed(model: StateSpaceStrengthModel, values: number[]) {
  let state = model.state;
  for (const v of values) state = model.update(v);
  return state;
}

/** Deterministic pseudo-random noise in [-amp, amp] from a seed. */
function noisy(base: number, i: number, amp: number): number {
  const r = Math.sin(i * 12.9898) * 43758.5453;
  const frac = r - Math.floor(r); // [0, 1)
  return base + (frac * 2 - 1) * amp;
}

// ---------------------------------------------------------------------------
// Seeding / initial state
// ---------------------------------------------------------------------------

describe('StateSpaceStrengthModel', () => {
  describe('seeding', () => {
    it('starts with zero observations and no data', () => {
      const model = new StateSpaceStrengthModel();
      expect(model.state.observations).toBe(0);
    });

    it('seeds the level from the first observation when no prior configured', () => {
      const model = new StateSpaceStrengthModel();
      const state = model.update(180);
      expect(state.estimate).toBe(180);
      expect(state.trend).toBe(0);
      expect(state.observations).toBe(1);
    });

    it('does not drag the first estimate toward zero', () => {
      // A diffuse prior around 0 must not pull a 200 kg first observation down.
      const model = new StateSpaceStrengthModel();
      expect(model.update(200).estimate).toBe(200);
    });

    it('blends from a configured initial estimate instead of seeding', () => {
      const model = new StateSpaceStrengthModel({
        initialEstimate: 100,
        initialVariance: 1,
        observationNoise: 1,
      });
      const state = model.update(200);
      // With equal prior/obs variance the estimate lands between the two.
      expect(state.estimate).toBeGreaterThan(100);
      expect(state.estimate).toBeLessThan(200);
    });
  });

  // -------------------------------------------------------------------------
  // Convergence to a constant signal
  // -------------------------------------------------------------------------

  describe('constant signal', () => {
    it('converges to the constant', () => {
      const model = new StateSpaceStrengthModel();
      const state = feed(model, Array(50).fill(150));
      expect(state.estimate).toBeCloseTo(150, 1);
    });

    it('drives trend toward zero for a flat signal', () => {
      const model = new StateSpaceStrengthModel();
      const state = feed(model, Array(50).fill(150));
      expect(Math.abs(state.trend)).toBeLessThan(0.1);
    });

    it('smooths a noisy constant toward its mean', () => {
      const model = new StateSpaceStrengthModel();
      const obs = Array.from({ length: 80 }, (_, i) => noisy(200, i, 10));
      const state = feed(model, obs);
      expect(state.estimate).toBeGreaterThan(195);
      expect(state.estimate).toBeLessThan(205);
    });
  });

  // -------------------------------------------------------------------------
  // Uncertainty behaviour
  // -------------------------------------------------------------------------

  describe('uncertainty', () => {
    it('shrinks variance as observations accumulate', () => {
      const model = new StateSpaceStrengthModel();
      model.update(150);
      const early = model.update(150).variance;
      const late = feed(model, Array(40).fill(150)).variance;
      expect(late).toBeLessThan(early);
    });

    it('reaches a positive steady-state variance, not zero', () => {
      const model = new StateSpaceStrengthModel();
      const state = feed(model, Array(100).fill(150));
      expect(state.variance).toBeGreaterThan(0);
      // Steady state is bounded well below the observation noise.
      expect(state.variance).toBeLessThan(DEFAULT_OBSERVATION_NOISE);
    });

    it('trusts a low-noise observation more than a high-noise one', () => {
      const precise = new StateSpaceStrengthModel({ initialEstimate: 100, initialVariance: 100 });
      const vague = new StateSpaceStrengthModel({ initialEstimate: 100, initialVariance: 100 });

      const precisen = precise.update(200, 1).estimate;
      const vaguen = vague.update(200, 10_000).estimate;

      // Both move toward 200, but the precise observation moves further.
      expect(precisen).toBeGreaterThan(vaguen);
    });
  });

  // -------------------------------------------------------------------------
  // Tracking a step change
  // -------------------------------------------------------------------------

  // A local-linear-trend filter overshoots a step change (it briefly builds up
  // trend) and then recovers, so we assert it tracks *near* the new level after
  // enough observations rather than pinning an exact value.
  describe('step change', () => {
    it('tracks a step up in the signal', () => {
      const model = new StateSpaceStrengthModel();
      feed(model, Array(30).fill(100));
      const state = feed(model, Array(40).fill(140));
      expect(state.estimate).toBeGreaterThan(135);
      expect(state.estimate).toBeLessThan(145);
    });

    it('tracks a step down in the signal', () => {
      const model = new StateSpaceStrengthModel();
      feed(model, Array(30).fill(140));
      const state = feed(model, Array(40).fill(100));
      expect(state.estimate).toBeGreaterThan(95);
      expect(state.estimate).toBeLessThan(105);
    });

    it('moves decisively off the old level toward the new one', () => {
      const model = new StateSpaceStrengthModel();
      feed(model, Array(30).fill(100));
      const state = feed(model, Array(5).fill(140));
      // Within a few observations it has covered most of the 40-unit gap.
      expect(state.estimate).toBeGreaterThan(125);
    });
  });

  // -------------------------------------------------------------------------
  // Trend tracking
  // -------------------------------------------------------------------------

  describe('trend tracking', () => {
    it('estimates a positive trend for a steadily rising signal', () => {
      const model = new StateSpaceStrengthModel();
      const ramp = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
      const state = feed(model, ramp);
      expect(state.trend).toBeGreaterThan(1);
      expect(state.trend).toBeLessThan(3);
    });

    it('estimates a negative trend for a steadily falling signal', () => {
      const model = new StateSpaceStrengthModel();
      const ramp = Array.from({ length: 40 }, (_, i) => 200 - i * 1.5);
      const state = feed(model, ramp);
      expect(state.trend).toBeLessThan(0);
    });

    it('extrapolates the level along a linear ramp', () => {
      const model = new StateSpaceStrengthModel();
      const ramp = Array.from({ length: 40 }, (_, i) => 100 + i * 2);
      const state = feed(model, ramp);
      // Last observation is 100 + 39*2 = 178; the tracked level should be near it.
      expect(state.estimate).toBeGreaterThan(172);
      expect(state.estimate).toBeLessThan(184);
    });
  });

  // -------------------------------------------------------------------------
  // API / validation
  // -------------------------------------------------------------------------

  describe('api', () => {
    it('exposes state without mutating the filter', () => {
      const model = new StateSpaceStrengthModel();
      model.update(150);
      const a = model.state;
      const b = model.state;
      expect(a).toEqual(b);
      expect(a.observations).toBe(1);
    });

    it('counts observations across updates', () => {
      const model = new StateSpaceStrengthModel();
      feed(model, [1, 2, 3, 4]);
      expect(model.state.observations).toBe(4);
    });

    it('throws on a non-finite observation', () => {
      const model = new StateSpaceStrengthModel();
      model.update(100);
      expect(() => model.update(NaN)).toThrow(RangeError);
      expect(() => model.update(Infinity)).toThrow(RangeError);
    });

    it('throws on a non-positive observation variance', () => {
      const model = new StateSpaceStrengthModel({ initialEstimate: 100 });
      expect(() => model.update(100, 0)).toThrow(RangeError);
      expect(() => model.update(100, -5)).toThrow(RangeError);
    });
  });
});
