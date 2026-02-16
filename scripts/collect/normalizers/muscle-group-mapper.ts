/**
 * Muscle Group Mapper
 *
 * Maps raw muscle group strings from various APIs to normalized MuscleGroupId values.
 * Handles the diversity of naming conventions across ExerciseDB, WGER, and other sources.
 */

import type { MuscleGroupId } from '../../shared/types.js';

// =============================================================================
// Muscle Group Mapping
// =============================================================================

/**
 * Map of raw muscle group strings (lowercase) to normalized MuscleGroupId.
 * Covers naming variations from ExerciseDB, WGER, and common fitness terminology.
 */
const MUSCLE_GROUP_MAP: Record<string, MuscleGroupId> = {
  // Chest
  chest: 'chest',
  pectorals: 'chest',
  'pectoralis major': 'chest',
  'pectoralis minor': 'chest',
  pectoralis: 'chest',
  pecs: 'chest',

  // Back
  back: 'back',
  'upper back': 'back',
  'lower back': 'back',
  'middle back': 'back',
  'latissimus dorsi': 'lats',
  lats: 'lats',
  rhomboids: 'back',
  'erector spinae': 'back',
  'spine': 'back',

  // Shoulders
  shoulders: 'shoulders',
  delts: 'shoulders',
  deltoids: 'shoulders',
  'anterior deltoid': 'shoulders',
  'lateral deltoid': 'shoulders',
  'posterior deltoid': 'shoulders',
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'shoulders',
  'serratus anterior': 'shoulders',

  // Biceps
  biceps: 'biceps',
  'biceps brachii': 'biceps',

  // Triceps
  triceps: 'triceps',
  'triceps brachii': 'triceps',

  // Quadriceps
  quads: 'quads',
  quadriceps: 'quads',
  'upper legs': 'quads',

  // Hamstrings
  hamstrings: 'hamstrings',
  'biceps femoris': 'hamstrings',

  // Glutes
  glutes: 'glutes',
  'gluteus maximus': 'glutes',
  'gluteus medius': 'glutes',
  'gluteus minimus': 'glutes',

  // Calves
  calves: 'calves',
  gastrocnemius: 'calves',
  soleus: 'calves',
  'lower legs': 'calves',

  // Core
  core: 'core',
  abs: 'abs',
  abdominals: 'abs',
  'rectus abdominis': 'abs',
  'transverse abdominis': 'core',
  obliques: 'obliques',
  'external oblique': 'obliques',
  'internal oblique': 'obliques',
  waist: 'core',

  // Forearms
  forearms: 'forearms',
  'forearm': 'forearms',
  'wrist flexors': 'forearms',
  'wrist extensors': 'forearms',
  'brachioradialis': 'forearms',

  // Traps
  traps: 'traps',
  trapezius: 'traps',

  // Adductors / Abductors
  adductors: 'adductors',
  'hip adductors': 'adductors',
  'inner thighs': 'adductors',
  abductors: 'abductors',
  'hip abductors': 'abductors',
  'outer thighs': 'abductors',

  // Neck
  neck: 'neck',
  'levator scapulae': 'neck',
  sternocleidomastoid: 'neck',
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Map a raw muscle group string to a normalized MuscleGroupId.
 * Returns null if the string cannot be mapped.
 */
export function mapMuscleGroup(raw: string): MuscleGroupId | null {
  if (!raw) return null;

  const normalized = raw.toLowerCase().trim();

  // Direct match
  if (normalized in MUSCLE_GROUP_MAP) {
    return MUSCLE_GROUP_MAP[normalized];
  }

  // Partial match (check if any key is contained in the raw string)
  for (const [key, value] of Object.entries(MUSCLE_GROUP_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }

  return null;
}

/**
 * Map multiple raw muscle group strings, filtering out nulls.
 */
export function mapMuscleGroups(raw: string[]): MuscleGroupId[] {
  return raw
    .map(mapMuscleGroup)
    .filter((m): m is MuscleGroupId => m !== null);
}

/**
 * Get all known raw muscle names for a given MuscleGroupId.
 */
export function getRawNamesForMuscleGroup(muscleGroup: MuscleGroupId): string[] {
  return Object.entries(MUSCLE_GROUP_MAP)
    .filter(([, value]) => value === muscleGroup)
    .map(([key]) => key);
}
