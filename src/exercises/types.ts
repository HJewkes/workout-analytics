/**
 * Exercise Library Types
 *
 * Public types for the exercise catalog.
 * These are the types that library consumers import and use.
 */

// =============================================================================
// Muscle Groups
// =============================================================================

export type MuscleGroupId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'
  | 'forearms'
  | 'traps'
  | 'lats'
  | 'abs'
  | 'obliques'
  | 'adductors'
  | 'abductors'
  | 'neck';

// =============================================================================
// Movement Patterns
// =============================================================================

export type MovementPatternId =
  | 'push'
  | 'pull'
  | 'hinge'
  | 'squat'
  | 'lunge'
  | 'carry'
  | 'rotation'
  | 'isolation';

// =============================================================================
// Equipment
// =============================================================================

export type EquipmentCategory =
  | 'cable'
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'bodyweight'
  | 'band'
  | 'kettlebell'
  | 'other';

export interface EquipmentInfo {
  name: string;
  category: EquipmentCategory;
}

// =============================================================================
// Cable Setup
// =============================================================================

export interface CableSetup {
  cablePath: 'high' | 'mid' | 'low' | 'floor' | 'multiple';
  attachments: string[];
  notes?: string;
  originalEquipment?: string;
}

// =============================================================================
// Exercise
// =============================================================================

export interface Exercise {
  /** Unique slug ID */
  id: string;
  /** Display name */
  name: string;
  /** Alternative names */
  aliases?: string[];

  /** Primary muscle groups */
  muscleGroups: MuscleGroupId[];
  /** Secondary muscle groups */
  secondaryMuscleGroups?: MuscleGroupId[];
  /** Movement pattern classification */
  movementPattern: MovementPatternId;
  /** Compound vs isolation */
  exerciseType: 'compound' | 'isolation';

  /** Equipment required */
  equipment: EquipmentInfo[];
  /** Whether this can be done with cables */
  cableEquivalent: boolean;
  /** Cable setup details (if cable-compatible) */
  cableSetup?: CableSetup;

  /** Exercise description */
  description?: string;
  /** Step-by-step instructions */
  instructions?: string[];
  /** Key form cues */
  formCues?: string[];
  /** Common mistakes */
  commonMistakes?: string[];
  /** Tips */
  tips?: string[];

  /** Data completeness score (0-100+) */
  qualityScore: number;
}
