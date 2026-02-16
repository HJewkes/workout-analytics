/**
 * Popularity Analyzer
 *
 * Scores exercises by relevance based on cross-source presence,
 * muscle group coverage, and equipment availability.
 */

import type { ExerciseMetadata, PopularityScore } from '../../shared/types.js';
import { normalizeForComparison, groupBy, sortByDescending } from '../../shared/utils.js';
import { categorizeEquipment, isCableEquivalent } from './equipment-analyzer.js';

// =============================================================================
// Popularity Scoring Weights
// =============================================================================

const WEIGHTS = {
  /** Bonus for appearing in multiple sources */
  crossSource: 25,
  /** Per-muscle-group points (more muscles = more useful) */
  muscleGroupCoverage: 10,
  /** Bonus for cable-compatible equipment */
  cableEquipment: 15,
  /** Bonus for common equipment availability */
  commonEquipment: 5,
  /** Bonus for being a compound movement (hits multiple muscles) */
  compoundMovement: 10,
  /** Bonus for having body part info */
  hasBodyPart: 3,
  /** Bonus for having category info */
  hasCategory: 2,
};

/**
 * Common muscle groups that most training programs target.
 * Exercises hitting these get a slight boost.
 */
const HIGH_PRIORITY_MUSCLES = new Set([
  'chest', 'pectoralis major', 'pectoralis',
  'back', 'latissimus dorsi', 'lats',
  'quads', 'quadriceps',
  'hamstrings', 'biceps femoris',
  'glutes', 'gluteus maximus',
  'shoulders', 'deltoids', 'anterior deltoid',
  'biceps', 'biceps brachii',
  'triceps', 'triceps brachii',
]);

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Score a single exercise based on its metadata.
 */
function scoreExercise(
  exercise: ExerciseMetadata,
  crossSourceCounts: Map<string, number>,
): PopularityScore {
  let score = 0;

  // Cross-source presence
  const normalizedName = normalizeForComparison(exercise.name);
  const crossCount = crossSourceCounts.get(normalizedName) ?? 1;
  const crossSourceScore = Math.min(crossCount - 1, 3) * WEIGHTS.crossSource;
  score += crossSourceScore;

  // Muscle group coverage
  const allMuscles = [...exercise.muscleGroups, ...exercise.secondaryMuscleGroups];
  const muscleScore = Math.min(allMuscles.length, 5) * WEIGHTS.muscleGroupCoverage;
  score += muscleScore;

  // High-priority muscles boost
  const hitsHighPriority = allMuscles.some((m) => HIGH_PRIORITY_MUSCLES.has(m.toLowerCase()));
  if (hitsHighPriority) score += 5;

  // Compound movement bonus
  if (allMuscles.length >= 2) score += WEIGHTS.compoundMovement;

  // Equipment scoring
  const equipmentCategories = exercise.equipment.map((e) => categorizeEquipment(e));
  if (equipmentCategories.includes('cable')) {
    score += WEIGHTS.cableEquipment;
  } else if (equipmentCategories.some((c) => isCableEquivalent(c))) {
    score += WEIGHTS.cableEquipment * 0.7;
  }

  if (equipmentCategories.some((c) => ['barbell', 'dumbbell', 'cable', 'bodyweight'].includes(c))) {
    score += WEIGHTS.commonEquipment;
  }

  // Metadata completeness
  if (exercise.bodyPart) score += WEIGHTS.hasBodyPart;
  if (exercise.category) score += WEIGHTS.hasCategory;

  return {
    sourceId: exercise.sourceId,
    source: exercise.source,
    name: exercise.name,
    score,
    crossSourceCount: crossCount,
    muscleGroupCoverage: muscleScore,
    equipmentAvailability: equipmentCategories.length > 0 ? 1 : 0,
  };
}

// =============================================================================
// Cross-Source Matching
// =============================================================================

/**
 * Build a map of normalized exercise names to cross-source counts.
 * Uses fuzzy matching to identify the same exercise across different APIs.
 */
function buildCrossSourceMap(exercises: ExerciseMetadata[]): Map<string, number> {
  const nameSourceMap = new Map<string, Set<string>>();

  for (const ex of exercises) {
    const normalized = normalizeForComparison(ex.name);
    if (!nameSourceMap.has(normalized)) {
      nameSourceMap.set(normalized, new Set());
    }
    nameSourceMap.get(normalized)!.add(ex.source);
  }

  const crossSourceCounts = new Map<string, number>();
  for (const [name, sources] of nameSourceMap) {
    crossSourceCounts.set(name, sources.size);
  }

  return crossSourceCounts;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Analyze exercise popularity across all collected metadata.
 */
export function analyzePopularity(exercises: ExerciseMetadata[]): PopularityScore[] {
  const crossSourceCounts = buildCrossSourceMap(exercises);

  const scores = exercises.map((ex) => scoreExercise(ex, crossSourceCounts));

  return sortByDescending(scores, (s) => s.score);
}

/**
 * Get the top N exercises by popularity score.
 */
export function getTopExercises(
  scores: PopularityScore[],
  limit: number,
): PopularityScore[] {
  return scores.slice(0, limit);
}

/**
 * Get popularity statistics.
 */
export function getPopularityStats(scores: PopularityScore[]): {
  total: number;
  meanScore: number;
  medianScore: number;
  maxScore: number;
  minScore: number;
  crossSourceExercises: number;
  bySource: Record<string, number>;
} {
  if (scores.length === 0) {
    return {
      total: 0,
      meanScore: 0,
      medianScore: 0,
      maxScore: 0,
      minScore: 0,
      crossSourceExercises: 0,
      bySource: {},
    };
  }

  const sorted = [...scores].sort((a, b) => a.score - b.score);
  const total = scores.length;

  return {
    total,
    meanScore: scores.reduce((sum, s) => sum + s.score, 0) / total,
    medianScore: sorted[Math.floor(total / 2)].score,
    maxScore: sorted[total - 1].score,
    minScore: sorted[0].score,
    crossSourceExercises: scores.filter((s) => s.crossSourceCount > 1).length,
    bySource: Object.fromEntries(
      Object.entries(groupBy(scores, (s) => s.source)).map(([source, items]) => [
        source,
        items.length,
      ]),
    ),
  };
}
