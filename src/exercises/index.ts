/**
 * Exercise Library
 *
 * Public API for the exercise catalog.
 * Provides types and lookup functions for exercises.
 */

// Types
export type {
  Exercise,
  MuscleGroupId,
  MovementPatternId,
  EquipmentCategory,
  EquipmentInfo,
  CableSetup,
} from './types.js';

// Catalog functions
export {
  setCatalog,
  loadCatalog,
  getExerciseById,
  getAllExercises,
  getExercisesByMuscleGroup,
  getExercisesByMovementPattern,
  getExercisesByEquipment,
  getCableExercises,
  searchExercises,
  hasExercise,
  getExerciseCount,
} from './catalog.js';
