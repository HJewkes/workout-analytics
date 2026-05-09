/**
 * Bayesian LV Profile Fitting Tests
 *
 * Verifies conjugate Bayesian linear regression over (a, b) in v = a + b*load.
 */

import { describe, it, expect } from 'vitest';
import { fitLVProfileBayesian } from '@/vbt/profile-fitting-bayesian';
import type { LoadVelocityDataPoint } from '@/vbt/profile';

// =============================================================================
// Helpers
// =============================================================================

/** Generate points along v = trueA + trueB * load with optional Gaussian noise. */
function syntheticData(
  trueA: number,
  trueB: number,
  loads: number[],
  noiseStd = 0
): LoadVelocityDataPoint[] {
  // Deterministic pseudo-noise so tests are reproducible: noise_i = noiseStd * sin(i)
  return loads.map((load, i) => ({
    load,
    velocity: trueA + trueB * load + noiseStd * Math.sin(i + 1),
  }));
}

// =============================================================================
// Tests
// =============================================================================

describe('fitLVProfileBayesian', () => {
  describe('empty data', () => {
    it('returns prior unchanged with n=0 and rSquared=0', () => {
      const result = fitLVProfileBayesian([], {
        meanA: 1.5,
        meanB: -0.005,
        varA: 1.0,
        varB: 0.001,
      });

      expect(result.a).toBe(1.5);
      expect(result.b).toBe(-0.005);
      expect(result.varA).toBe(1.0);
      expect(result.varB).toBe(0.001);
      expect(result.corr).toBe(0);
      expect(result.rSquared).toBe(0);
      expect(result.n).toBe(0);
    });

    it('uses default prior when none supplied', () => {
      const result = fitLVProfileBayesian([]);
      expect(result.a).toBe(1.5);
      expect(result.b).toBe(-0.005);
      expect(result.n).toBe(0);
    });
  });

  describe('single data point', () => {
    it('shifts posterior toward observed point while keeping high variance', () => {
      const prior = { meanA: 1.0, meanB: -0.003, varA: 1.0, varB: 0.001, sigma2: 0.01 };
      const data: LoadVelocityDataPoint[] = [{ load: 60, velocity: 1.2 }];

      const result = fitLVProfileBayesian(data, prior);

      // Posterior mean should be between prior mean and data; not equal to either.
      // Prior prediction at load=60: 1.0 + (-0.003)*60 = 0.82. Observed: 1.2.
      // Posterior a + b*60 should be between 0.82 and 1.2.
      const priorPred = prior.meanA + prior.meanB * 60;
      const postPred = result.a + result.b * 60;
      expect(postPred).toBeGreaterThan(priorPred);
      expect(postPred).toBeLessThan(1.2);

      // Variance should still be substantial (one point is not enough to collapse it).
      expect(result.varA).toBeGreaterThan(0);
      expect(result.varB).toBeGreaterThan(0);

      expect(result.n).toBe(1);
    });

    it('returns finite numbers (no NaN)', () => {
      const result = fitLVProfileBayesian([{ load: 100, velocity: 0.5 }]);
      expect(isFinite(result.a)).toBe(true);
      expect(isFinite(result.b)).toBe(true);
      expect(isFinite(result.varA)).toBe(true);
      expect(isFinite(result.varB)).toBe(true);
      expect(isFinite(result.corr)).toBe(true);
    });
  });

  describe('many points on a clean line', () => {
    it('posterior mean converges close to the true (a, b)', () => {
      const trueA = 1.5;
      const trueB = -0.008;
      const loads = [20, 40, 60, 80, 100, 120, 140];
      const data = syntheticData(trueA, trueB, loads, 0);

      const result = fitLVProfileBayesian(data, {
        meanA: 1.5,
        meanB: -0.005,
        varA: 1.0,
        varB: 0.001,
        sigma2: 0.0001, // tight — trust the data
      });

      expect(result.a).toBeCloseTo(trueA, 1);
      expect(result.b).toBeCloseTo(trueB, 3);
      expect(result.rSquared).toBeCloseTo(1.0, 2);
      expect(result.n).toBe(loads.length);
    });

    it('variances shrink to small values after many clean observations', () => {
      const loads = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200];
      const data = syntheticData(1.5, -0.007, loads, 0);

      const prior = { varA: 1.0, varB: 0.001, sigma2: 0.01 };
      const result = fitLVProfileBayesian(data, prior);

      expect(result.varA).toBeLessThan(prior.varA);
      expect(result.varB).toBeLessThan(prior.varB);
    });
  });

  describe('noisy data', () => {
    it('higher assumed sigma2 → posterior retains more prior variance', () => {
      // In conjugate Bayesian LR with fixed sigma2, posterior variance depends on
      // sigma2 (noise assumption) and the design matrix, NOT the observed y values.
      // So "noisier" data is expressed by a larger sigma2 hyperparameter.
      const loads = [20, 40, 60, 80, 100];
      const data = syntheticData(1.5, -0.007, loads, 0);

      const tightNoiseResult = fitLVProfileBayesian(data, {
        meanA: 1.5, meanB: -0.007, varA: 2.0, varB: 0.005, sigma2: 0.001,
      });
      const looseNoiseResult = fitLVProfileBayesian(data, {
        meanA: 1.5, meanB: -0.007, varA: 2.0, varB: 0.005, sigma2: 0.5,
      });

      // With higher assumed observation noise, data is trusted less → more posterior variance.
      expect(looseNoiseResult.varA + looseNoiseResult.varB).toBeGreaterThan(
        tightNoiseResult.varA + tightNoiseResult.varB
      );
    });

    it('R² is lower for noisy data than clean data on the same true line', () => {
      const loads = [20, 40, 60, 80, 100];
      const cleanData = syntheticData(1.5, -0.007, loads, 0);
      const noisyData = syntheticData(1.5, -0.007, loads, 0.15);

      const prior = { meanA: 1.5, meanB: -0.007, varA: 2.0, varB: 0.005, sigma2: 0.01 };
      const cleanResult = fitLVProfileBayesian(cleanData, prior);
      const noisyResult = fitLVProfileBayesian(noisyData, prior);

      expect(cleanResult.rSquared).toBeGreaterThan(noisyResult.rSquared);
    });
  });

  describe('prior vs data balance', () => {
    it('strong prior + few data points → posterior closer to prior than to data', () => {
      // Prior: a=2.0, b=-0.010. True line: a=1.0, b=-0.003.
      // With very tight prior (small variances) and only 2 points, prior should dominate.
      const priorMeanA = 2.0;
      const priorMeanB = -0.01;
      const trueA = 1.0;
      const trueB = -0.003;

      const data = syntheticData(trueA, trueB, [40, 80], 0);

      const result = fitLVProfileBayesian(data, {
        meanA: priorMeanA,
        meanB: priorMeanB,
        varA: 0.001, // very tight
        varB: 0.0001, // very tight
        sigma2: 0.01,
      });

      const distFromPrior = Math.abs(result.a - priorMeanA) + Math.abs(result.b - priorMeanB);
      const distFromData = Math.abs(result.a - trueA) + Math.abs(result.b - trueB);

      expect(distFromPrior).toBeLessThan(distFromData);
    });

    it('weak prior + many data points → posterior closer to data than to prior', () => {
      const priorMeanA = 2.0;
      const priorMeanB = -0.01;
      const trueA = 1.2;
      const trueB = -0.006;

      const loads = [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
      const data = syntheticData(trueA, trueB, loads, 0.001); // nearly clean

      const result = fitLVProfileBayesian(data, {
        meanA: priorMeanA,
        meanB: priorMeanB,
        varA: 100.0, // very weak
        varB: 10.0, // very weak
        sigma2: 0.01,
      });

      const distFromPrior = Math.abs(result.a - priorMeanA) + Math.abs(result.b - priorMeanB);
      const distFromData = Math.abs(result.a - trueA) + Math.abs(result.b - trueB);

      expect(distFromData).toBeLessThan(distFromPrior);
    });
  });

  describe('posterior correlation', () => {
    it('correlation is negative for any non-trivial multi-point fit', () => {
      const data = syntheticData(1.5, -0.007, [20, 60, 100], 0);
      const result = fitLVProfileBayesian(data);
      expect(result.corr).toBeLessThan(0);
    });

    it('correlation magnitude is in (-1, 0) range', () => {
      const data = syntheticData(1.5, -0.007, [20, 40, 60, 80, 100], 0.02);
      const result = fitLVProfileBayesian(data);
      expect(result.corr).toBeGreaterThan(-1);
      expect(result.corr).toBeLessThan(0);
    });
  });

  describe('R² quality', () => {
    it('R² is close to 1 for a clean linear dataset', () => {
      const data = syntheticData(1.5, -0.007, [20, 40, 60, 80, 100], 0);
      const result = fitLVProfileBayesian(data, { sigma2: 0.0001 });
      expect(result.rSquared).toBeGreaterThan(0.99);
    });

    it('R² is 0 for empty data', () => {
      expect(fitLVProfileBayesian([]).rSquared).toBe(0);
    });

    it('R² is 0 for a single data point', () => {
      const result = fitLVProfileBayesian([{ load: 80, velocity: 0.9 }]);
      expect(result.rSquared).toBe(0);
    });

    it('R² is lower for high-noise data than low-noise data', () => {
      const loads = [20, 40, 60, 80, 100];
      const lowNoise = fitLVProfileBayesian(syntheticData(1.5, -0.007, loads, 0.01));
      const highNoise = fitLVProfileBayesian(syntheticData(1.5, -0.007, loads, 0.2));
      expect(lowNoise.rSquared).toBeGreaterThan(highNoise.rSquared);
    });
  });

  describe('degenerate inputs', () => {
    it('all points at the same load → returns finite values (no NaN)', () => {
      // X'X is rank-1 (singular data matrix). invert2x2 guard should prevent NaN.
      const data: LoadVelocityDataPoint[] = [
        { load: 60, velocity: 0.8 },
        { load: 60, velocity: 0.9 },
        { load: 60, velocity: 0.85 },
      ];
      const result = fitLVProfileBayesian(data);
      expect(isFinite(result.a)).toBe(true);
      expect(isFinite(result.b)).toBe(true);
      expect(isFinite(result.varA)).toBe(true);
      expect(isFinite(result.varB)).toBe(true);
      expect(isFinite(result.corr)).toBe(true);
    });
  });
});
