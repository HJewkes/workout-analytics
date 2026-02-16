/**
 * Exercise Normalizer
 *
 * Converts source-specific exercise formats into the unified NormalizedExercise schema.
 * Handles field mapping, inference, and standardization.
 */

import type { MovementPatternId, MuscleGroupId } from '../../shared/types.js';

// =============================================================================
// Movement Pattern Inference
// =============================================================================

/**
 * Name keywords that indicate specific movement patterns.
 */
const PATTERN_KEYWORDS: Array<{ keywords: string[]; pattern: MovementPatternId }> = [
  // Push
  { keywords: ['press', 'push up', 'pushup', 'push-up', 'dip', 'fly', 'flye'], pattern: 'push' },

  // Pull
  { keywords: ['row', 'pull up', 'pullup', 'pull-up', 'chin up', 'chinup', 'chin-up', 'pulldown', 'pull down', 'face pull'], pattern: 'pull' },

  // Hinge
  { keywords: ['deadlift', 'hip thrust', 'good morning', 'pull through', 'romanian', 'rdl', 'stiff leg', 'hyperextension'], pattern: 'hinge' },

  // Squat
  { keywords: ['squat', 'leg press', 'hack squat'], pattern: 'squat' },

  // Lunge
  { keywords: ['lunge', 'split squat', 'step up', 'step-up', 'bulgarian'], pattern: 'lunge' },

  // Carry
  { keywords: ['carry', 'walk', 'farmer'], pattern: 'carry' },

  // Rotation
  { keywords: ['rotation', 'twist', 'woodchop', 'wood chop', 'russian twist'], pattern: 'rotation' },

  // Isolation
  { keywords: ['curl', 'extension', 'raise', 'fly', 'flye', 'kickback', 'shrug', 'calf raise', 'wrist'], pattern: 'isolation' },
];

/**
 * Body part / category to default movement pattern.
 */
const BODY_PART_TO_PATTERN: Record<string, MovementPatternId> = {
  chest: 'push',
  back: 'pull',
  shoulders: 'push',
  'upper arms': 'isolation',
  'lower arms': 'isolation',
  'upper legs': 'squat',
  'lower legs': 'isolation',
  waist: 'isolation',
  neck: 'isolation',
  cardio: 'carry',
  abs: 'isolation',
  arms: 'isolation',
  legs: 'squat',
};

/**
 * Infer the movement pattern from exercise name and metadata.
 */
export function inferMovementPattern(
  name: string,
  bodyPart?: string,
  targetMuscle?: string,
): MovementPatternId {
  const nameLower = name.toLowerCase();

  // Check name-based patterns first (most specific)
  for (const { keywords, pattern } of PATTERN_KEYWORDS) {
    if (keywords.some((kw) => nameLower.includes(kw))) {
      return pattern;
    }
  }

  // Fall back to body part mapping
  if (bodyPart) {
    const normalized = bodyPart.toLowerCase();
    if (normalized in BODY_PART_TO_PATTERN) {
      return BODY_PART_TO_PATTERN[normalized];
    }
  }

  // Fall back to target muscle
  if (targetMuscle) {
    const normalized = targetMuscle.toLowerCase();
    if (normalized in BODY_PART_TO_PATTERN) {
      return BODY_PART_TO_PATTERN[normalized];
    }
  }

  return 'isolation';
}

// =============================================================================
// Exercise Type Inference
// =============================================================================

/**
 * Infer whether an exercise is compound or isolation based on muscle groups.
 */
export function inferExerciseType(
  primary: MuscleGroupId[],
  secondary: MuscleGroupId[],
): 'compound' | 'isolation' {
  const totalMuscleGroups = new Set([...primary, ...secondary]).size;
  return totalMuscleGroups >= 2 ? 'compound' : 'isolation';
}

// =============================================================================
// Name Normalization
// =============================================================================

/**
 * Clean and standardize an exercise name.
 */
export function normalizeExerciseName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    // Capitalize first letter of each word
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
