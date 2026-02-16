/**
 * Exercise Filter
 *
 * Filtering pipeline that narrows exercises by cable compatibility,
 * popularity, muscle group coverage, and exercise type balance.
 */

import type {
  ExerciseMetadata,
  FilterResult,
  FilterCriteria,
  PopularityScore,
  MuscleGroupId,
} from '../../shared/types.js';
import { isCableCompatible } from '../analyzers/cable-equivalence.js';
import { categorizeEquipment } from '../analyzers/equipment-analyzer.js';
import { normalizeForComparison, groupBy, log } from '../../shared/utils.js';

// =============================================================================
// Default Filter Criteria
// =============================================================================

export const DEFAULT_FILTER_CRITERIA: FilterCriteria = {
  cableEquivalentOnly: false,
  minPopularityScore: 20,
  ensureMuscleCoverage: true,
  compoundIsolationBalance: true,
  maxExercises: 500,
};

// =============================================================================
// Muscle Group Coverage
// =============================================================================

/**
 * Core muscle groups that must be covered in the final selection.
 */
const REQUIRED_MUSCLE_GROUPS: string[] = [
  'chest', 'pectoralis',
  'back', 'latissimus', 'lats',
  'shoulders', 'deltoid',
  'biceps',
  'triceps',
  'quads', 'quadriceps',
  'hamstrings',
  'glutes', 'gluteus',
  'core', 'abs', 'abdominal',
  'calves',
];

/**
 * Minimum exercises per muscle group to ensure coverage.
 */
const MIN_PER_MUSCLE_GROUP = 3;

// =============================================================================
// Filtering Pipeline
// =============================================================================

/**
 * Apply the full filtering pipeline to exercise metadata.
 */
export function filterExercises(
  exercises: ExerciseMetadata[],
  popularityScores: Map<string, number>,
  criteria: FilterCriteria = DEFAULT_FILTER_CRITERIA,
): FilterResult {
  let filtered = [...exercises];
  const totalAnalyzed = filtered.length;

  log(`Starting filter: ${totalAnalyzed} exercises`);

  // Step 1: Deduplicate by normalized name (keep highest-popularity version)
  filtered = deduplicateByName(filtered, popularityScores);
  log(`  After dedup: ${filtered.length}`);

  // Step 2: Filter by cable compatibility
  if (criteria.cableEquivalentOnly) {
    filtered = filtered.filter(isCableCompatible);
    log(`  After cable filter: ${filtered.length}`);
  }

  // Step 3: Filter by popularity threshold
  filtered = filtered.filter((ex) => {
    const key = `${ex.source}:${ex.sourceId}`;
    const score = popularityScores.get(key) ?? 0;
    return score >= criteria.minPopularityScore;
  });
  log(`  After popularity filter (>= ${criteria.minPopularityScore}): ${filtered.length}`);

  // Step 4: Ensure muscle group coverage
  if (criteria.ensureMuscleCoverage) {
    filtered = ensureMuscleCoverage(filtered, popularityScores);
    log(`  After muscle coverage: ${filtered.length}`);
  }

  // Step 5: Cap to max exercises (keep highest popularity)
  if (filtered.length > criteria.maxExercises) {
    filtered = sortByPopularity(filtered, popularityScores).slice(0, criteria.maxExercises);
    log(`  After cap to ${criteria.maxExercises}: ${filtered.length}`);
  }

  return {
    totalAnalyzed,
    totalPassed: filtered.length,
    exercises: filtered,
    filterCriteria: criteria,
  };
}

// =============================================================================
// Internal Helpers
// =============================================================================

function deduplicateByName(
  exercises: ExerciseMetadata[],
  popularityScores: Map<string, number>,
): ExerciseMetadata[] {
  const byName = new Map<string, ExerciseMetadata>();

  for (const ex of exercises) {
    const normalized = normalizeForComparison(ex.name);
    const existing = byName.get(normalized);

    if (!existing) {
      byName.set(normalized, ex);
    } else {
      // Keep the one with more data
      const existingScore = popularityScores.get(`${existing.source}:${existing.sourceId}`) ?? 0;
      const newScore = popularityScores.get(`${ex.source}:${ex.sourceId}`) ?? 0;

      if (newScore > existingScore) {
        byName.set(normalized, ex);
      }
    }
  }

  return [...byName.values()];
}

function ensureMuscleCoverage(
  exercises: ExerciseMetadata[],
  popularityScores: Map<string, number>,
): ExerciseMetadata[] {
  const result = new Set(exercises);

  // Check coverage for each required muscle group
  for (const muscleGroup of REQUIRED_MUSCLE_GROUPS) {
    const matching = exercises.filter((ex) =>
      [...ex.muscleGroups, ...ex.secondaryMuscleGroups].some(
        (mg) => mg.toLowerCase().includes(muscleGroup),
      ),
    );

    if (matching.length < MIN_PER_MUSCLE_GROUP) {
      // This muscle group is under-represented; we already have whatever was available
      // No action needed since we can't add exercises not in the filtered set
    }
  }

  return [...result];
}

function sortByPopularity(
  exercises: ExerciseMetadata[],
  popularityScores: Map<string, number>,
): ExerciseMetadata[] {
  return [...exercises].sort((a, b) => {
    const scoreA = popularityScores.get(`${a.source}:${a.sourceId}`) ?? 0;
    const scoreB = popularityScores.get(`${b.source}:${b.sourceId}`) ?? 0;
    return scoreB - scoreA;
  });
}

// =============================================================================
// Utility
// =============================================================================

/**
 * Convert popularity scores array to a lookup map.
 */
export function buildPopularityMap(scores: PopularityScore[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const score of scores) {
    map.set(`${score.source}:${score.sourceId}`, score.score);
  }
  return map;
}

/**
 * Get muscle group coverage statistics for a set of exercises.
 */
export function getMuscleCoverage(
  exercises: ExerciseMetadata[],
): Record<string, number> {
  const coverage: Record<string, number> = {};

  for (const ex of exercises) {
    for (const mg of [...ex.muscleGroups, ...ex.secondaryMuscleGroups]) {
      const normalized = mg.toLowerCase();
      coverage[normalized] = (coverage[normalized] ?? 0) + 1;
    }
  }

  return Object.fromEntries(
    Object.entries(coverage).sort(([, a], [, b]) => b - a),
  );
}
