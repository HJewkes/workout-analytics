/**
 * Exercise Catalog
 *
 * Provides lookup functions for the exercise library.
 * Data is loaded from the generated catalog JSON file.
 *
 * If the catalog data file doesn't exist yet (hasn't been generated),
 * an empty catalog is used. Run the collection pipeline to populate:
 *   npm run exercises:pipeline
 */

import type { Exercise, MuscleGroupId, MovementPatternId, EquipmentCategory } from './types';

// =============================================================================
// Catalog Data
// =============================================================================

/**
 * Internal catalog storage.
 * Populated by loadCatalog() or setCatalog().
 */
let catalogData: Exercise[] = [];
let indexesBuilt = false;

const byId = new Map<string, Exercise>();
const byMuscleGroup = new Map<MuscleGroupId, Exercise[]>();
const byMovementPattern = new Map<MovementPatternId, Exercise[]>();
const byEquipmentCategory = new Map<EquipmentCategory, Exercise[]>();

function buildIndexes(): void {
  if (indexesBuilt) return;

  byId.clear();
  byMuscleGroup.clear();
  byMovementPattern.clear();
  byEquipmentCategory.clear();

  for (const exercise of catalogData) {
    byId.set(exercise.id, exercise);

    for (const mg of exercise.muscleGroups) {
      if (!byMuscleGroup.has(mg)) byMuscleGroup.set(mg, []);
      byMuscleGroup.get(mg)!.push(exercise);
    }

    if (!byMovementPattern.has(exercise.movementPattern)) {
      byMovementPattern.set(exercise.movementPattern, []);
    }
    byMovementPattern.get(exercise.movementPattern)!.push(exercise);

    for (const eq of exercise.equipment) {
      if (!byEquipmentCategory.has(eq.category)) {
        byEquipmentCategory.set(eq.category, []);
      }
      byEquipmentCategory.get(eq.category)!.push(exercise);
    }
  }

  indexesBuilt = true;
}

// =============================================================================
// Catalog Loading
// =============================================================================

/**
 * Set the exercise catalog data directly.
 * Use this to provide exercises from any source (JSON import, API, etc.).
 */
export function setCatalog(exercises: Exercise[]): void {
  catalogData = exercises;
  indexesBuilt = false;
  buildIndexes();
}

/**
 * Load the exercise catalog from the generated data file.
 * Returns the number of exercises loaded.
 */
export async function loadCatalog(): Promise<number> {
  try {
    // Dynamic import — compiled to require() in CJS, import() in ESM
    const data = await import('./data/catalog.json');
    const exercises = (data.default ?? data) as Exercise[];
    setCatalog(exercises);
    return exercises.length;
  } catch {
    // Catalog not yet generated — empty catalog
    setCatalog([]);
    return 0;
  }
}

// =============================================================================
// Lookup Functions
// =============================================================================

/**
 * Get an exercise by its slug ID.
 */
export function getExerciseById(id: string): Exercise | undefined {
  buildIndexes();
  return byId.get(id);
}

/**
 * Get all exercises in the catalog.
 */
export function getAllExercises(): Exercise[] {
  buildIndexes();
  return catalogData;
}

/**
 * Get exercises by primary muscle group.
 */
export function getExercisesByMuscleGroup(muscleGroup: MuscleGroupId): Exercise[] {
  buildIndexes();
  return byMuscleGroup.get(muscleGroup) ?? [];
}

/**
 * Get exercises by movement pattern.
 */
export function getExercisesByMovementPattern(pattern: MovementPatternId): Exercise[] {
  buildIndexes();
  return byMovementPattern.get(pattern) ?? [];
}

/**
 * Get exercises by equipment category.
 */
export function getExercisesByEquipment(category: EquipmentCategory): Exercise[] {
  buildIndexes();
  return byEquipmentCategory.get(category) ?? [];
}

/**
 * Get all cable-compatible exercises.
 */
export function getCableExercises(): Exercise[] {
  buildIndexes();
  return catalogData.filter((ex) => ex.cableEquivalent);
}

/**
 * Search exercises by name (case-insensitive substring match).
 */
export function searchExercises(query: string): Exercise[] {
  buildIndexes();
  const normalized = query.toLowerCase();
  return catalogData.filter(
    (ex) =>
      ex.name.toLowerCase().includes(normalized) ||
      (ex.aliases?.some((a) => a.toLowerCase().includes(normalized)) ?? false)
  );
}

/**
 * Check if an exercise exists in the catalog.
 */
export function hasExercise(id: string): boolean {
  buildIndexes();
  return byId.has(id);
}

/**
 * Get the total number of exercises in the catalog.
 */
export function getExerciseCount(): number {
  return catalogData.length;
}
