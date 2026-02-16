/**
 * Quality Scorer
 *
 * Scores exercises by data completeness and quality.
 * Used to prioritize exercises for enrichment and identify gaps.
 */

import type { NormalizedExercise } from '../shared/types.js';
import { log } from '../shared/utils.js';

// =============================================================================
// Quality Scoring Weights
// =============================================================================

const QUALITY_WEIGHTS = {
  /** Has a name (required, but scored for completeness) */
  hasName: 1,
  /** Has a description */
  hasDescription: 10,
  /** Has step-by-step instructions */
  hasInstructions: 10,
  /** Per instruction step (capped at 5) */
  perInstruction: 2,
  /** Has form cues */
  hasFormCues: 15,
  /** Per form cue (capped at 5) */
  perFormCue: 3,
  /** Has common mistakes */
  hasCommonMistakes: 8,
  /** Has tips */
  hasTips: 5,
  /** Has primary muscle groups */
  hasMuscleGroups: 8,
  /** Has secondary muscle groups */
  hasSecondaryMuscles: 4,
  /** Has equipment info */
  hasEquipment: 5,
  /** Has images */
  hasImages: 10,
  /** Per image (capped at 3) */
  perImage: 2,
  /** Has videos */
  hasVideos: 12,
  /** Has GIFs */
  hasGifs: 10,
  /** Has VBT data */
  hasVBTData: 25,
  /** Has intensity guidelines */
  hasIntensityGuidelines: 5,
  /** Has cable setup info */
  hasCableSetup: 5,
  /** Has aliases */
  hasAliases: 3,
  /** From multiple sources */
  multiSource: 10,
  /** Per additional source (capped at 3) */
  perExtraSource: 5,
};

/** Maximum possible quality score */
export const MAX_QUALITY_SCORE =
  QUALITY_WEIGHTS.hasName +
  QUALITY_WEIGHTS.hasDescription +
  QUALITY_WEIGHTS.hasInstructions +
  QUALITY_WEIGHTS.perInstruction * 5 +
  QUALITY_WEIGHTS.hasFormCues +
  QUALITY_WEIGHTS.perFormCue * 5 +
  QUALITY_WEIGHTS.hasCommonMistakes +
  QUALITY_WEIGHTS.hasTips +
  QUALITY_WEIGHTS.hasMuscleGroups +
  QUALITY_WEIGHTS.hasSecondaryMuscles +
  QUALITY_WEIGHTS.hasEquipment +
  QUALITY_WEIGHTS.hasImages +
  QUALITY_WEIGHTS.perImage * 3 +
  QUALITY_WEIGHTS.hasVideos +
  QUALITY_WEIGHTS.hasGifs +
  QUALITY_WEIGHTS.hasVBTData +
  QUALITY_WEIGHTS.hasIntensityGuidelines +
  QUALITY_WEIGHTS.hasCableSetup +
  QUALITY_WEIGHTS.hasAliases +
  QUALITY_WEIGHTS.multiSource +
  QUALITY_WEIGHTS.perExtraSource * 3;

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Calculate the quality score for a single exercise.
 */
export function calculateQualityScore(exercise: NormalizedExercise): number {
  let score = 0;

  if (exercise.name) score += QUALITY_WEIGHTS.hasName;
  if (exercise.description) score += QUALITY_WEIGHTS.hasDescription;

  if (exercise.instructions && exercise.instructions.length > 0) {
    score += QUALITY_WEIGHTS.hasInstructions;
    score += Math.min(exercise.instructions.length, 5) * QUALITY_WEIGHTS.perInstruction;
  }

  if (exercise.formCues && exercise.formCues.length > 0) {
    score += QUALITY_WEIGHTS.hasFormCues;
    score += Math.min(exercise.formCues.length, 5) * QUALITY_WEIGHTS.perFormCue;
  }

  if (exercise.commonMistakes && exercise.commonMistakes.length > 0) {
    score += QUALITY_WEIGHTS.hasCommonMistakes;
  }

  if (exercise.tips && exercise.tips.length > 0) {
    score += QUALITY_WEIGHTS.hasTips;
  }

  if (exercise.muscleGroups.length > 0) score += QUALITY_WEIGHTS.hasMuscleGroups;
  if (exercise.secondaryMuscleGroups.length > 0) score += QUALITY_WEIGHTS.hasSecondaryMuscles;
  if (exercise.equipment.length > 0) score += QUALITY_WEIGHTS.hasEquipment;

  if (exercise.images.length > 0) {
    score += QUALITY_WEIGHTS.hasImages;
    score += Math.min(exercise.images.length, 3) * QUALITY_WEIGHTS.perImage;
  }

  if (exercise.videos.length > 0) score += QUALITY_WEIGHTS.hasVideos;
  if (exercise.gifs.length > 0) score += QUALITY_WEIGHTS.hasGifs;
  if (exercise.vbtData) score += QUALITY_WEIGHTS.hasVBTData;
  if (exercise.intensityGuidelines.length > 0) score += QUALITY_WEIGHTS.hasIntensityGuidelines;
  if (exercise.cableSetup) score += QUALITY_WEIGHTS.hasCableSetup;
  if (exercise.aliases.length > 0) score += QUALITY_WEIGHTS.hasAliases;

  if (exercise.sources.length > 1) {
    score += QUALITY_WEIGHTS.multiSource;
    score += Math.min(exercise.sources.length - 1, 3) * QUALITY_WEIGHTS.perExtraSource;
  }

  return score;
}

/**
 * Score all exercises and update their qualityScore field.
 */
export function scoreExercises(exercises: NormalizedExercise[]): NormalizedExercise[] {
  return exercises.map((ex) => ({
    ...ex,
    qualityScore: calculateQualityScore(ex),
  }));
}

// =============================================================================
// Quality Analysis
// =============================================================================

export interface QualityReport {
  total: number;
  meanScore: number;
  medianScore: number;
  maxScore: number;
  minScore: number;
  maxPossible: number;
  distribution: QualityBucket[];
  missingFields: MissingFieldCount[];
}

export interface QualityBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface MissingFieldCount {
  field: string;
  missingCount: number;
  missingPercentage: number;
}

/**
 * Generate a quality analysis report.
 */
export function generateQualityReport(exercises: NormalizedExercise[]): QualityReport {
  const scored = exercises.map((ex) => ({
    exercise: ex,
    score: ex.qualityScore || calculateQualityScore(ex),
  }));

  const scores = scored.map((s) => s.score).sort((a, b) => a - b);
  const total = scores.length;

  // Distribution buckets
  const buckets: QualityBucket[] = [
    { label: 'Minimal (0-20)', min: 0, max: 20, count: 0, percentage: 0 },
    { label: 'Basic (20-40)', min: 20, max: 40, count: 0, percentage: 0 },
    { label: 'Good (40-60)', min: 40, max: 60, count: 0, percentage: 0 },
    { label: 'Rich (60-80)', min: 60, max: 80, count: 0, percentage: 0 },
    { label: 'Excellent (80+)', min: 80, max: Infinity, count: 0, percentage: 0 },
  ];

  for (const score of scores) {
    for (const bucket of buckets) {
      if (score >= bucket.min && score < bucket.max) {
        bucket.count++;
        break;
      }
    }
  }

  for (const bucket of buckets) {
    bucket.percentage = total > 0 ? (bucket.count / total) * 100 : 0;
  }

  // Missing fields analysis
  const missingFields: MissingFieldCount[] = [
    countMissing(exercises, 'description', (ex) => !ex.description),
    countMissing(exercises, 'instructions', (ex) => !ex.instructions || ex.instructions.length === 0),
    countMissing(exercises, 'formCues', (ex) => !ex.formCues || ex.formCues.length === 0),
    countMissing(exercises, 'commonMistakes', (ex) => !ex.commonMistakes || ex.commonMistakes.length === 0),
    countMissing(exercises, 'muscleGroups', (ex) => ex.muscleGroups.length === 0),
    countMissing(exercises, 'equipment', (ex) => ex.equipment.length === 0),
    countMissing(exercises, 'images', (ex) => ex.images.length === 0),
    countMissing(exercises, 'videos', (ex) => ex.videos.length === 0),
    countMissing(exercises, 'gifs', (ex) => ex.gifs.length === 0),
    countMissing(exercises, 'vbtData', (ex) => !ex.vbtData),
    countMissing(exercises, 'cableSetup', (ex) => !ex.cableSetup),
  ];

  return {
    total,
    meanScore: total > 0 ? scores.reduce((s, v) => s + v, 0) / total : 0,
    medianScore: total > 0 ? scores[Math.floor(total / 2)] : 0,
    maxScore: total > 0 ? scores[total - 1] : 0,
    minScore: total > 0 ? scores[0] : 0,
    maxPossible: MAX_QUALITY_SCORE,
    distribution: buckets,
    missingFields,
  };
}

function countMissing(
  exercises: NormalizedExercise[],
  field: string,
  predicate: (ex: NormalizedExercise) => boolean,
): MissingFieldCount {
  const missingCount = exercises.filter(predicate).length;
  return {
    field,
    missingCount,
    missingPercentage: exercises.length > 0 ? (missingCount / exercises.length) * 100 : 0,
  };
}

/**
 * Print a quality report to the console.
 */
export function printQualityReport(report: QualityReport): void {
  log(`Quality Report (${report.total} exercises):`);
  console.log(`  Mean score:    ${report.meanScore.toFixed(1)} / ${report.maxPossible}`);
  console.log(`  Median score:  ${report.medianScore}`);
  console.log(`  Range:         ${report.minScore} - ${report.maxScore}`);
  console.log();

  log('Quality Distribution:');
  for (const bucket of report.distribution) {
    const bar = '#'.repeat(Math.round(bucket.percentage / 2));
    console.log(`  ${bucket.label.padEnd(20)} ${String(bucket.count).padStart(5)} (${bucket.percentage.toFixed(1).padStart(5)}%) ${bar}`);
  }
  console.log();

  log('Missing Fields:');
  for (const field of report.missingFields) {
    console.log(`  ${field.field.padEnd(20)} ${String(field.missingCount).padStart(5)} missing (${field.missingPercentage.toFixed(1)}%)`);
  }
}
