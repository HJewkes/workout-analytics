/**
 * `@voltras/workout-analytics/view` — the sole consumer door for derived
 * workout-view metrics (RPE, e1RM, tempo, per-rep velocity, weight deviation,
 * volume status, velocity-loss verdict banding).
 *
 * Reached via the package's `exports` map; not re-exported from the root
 * barrel beyond a deprecated compatibility window (see `src/index.ts`).
 * Consumers should import from here rather than reaching into
 * `analytics/view-model` or hand-rolling their own banding over raw
 * peak/mean metrics (VW-64).
 */

export {
  type E1RMSetInput,
  type VolumeLandmarks,
  type VolumeStatusName,
  type VelocityLossVerdict,
  estimateSetRpe,
  velocityLossVerdict,
  getSetRepPeakVelocities,
  getSetRepMeanVelocities,
  getSetTempoSeconds,
  bestE1RMAcrossSets,
  isNewE1RM,
  weightDeviationRatio,
  classifyWeeklyVolume,
} from '../analytics/view-model.js';
