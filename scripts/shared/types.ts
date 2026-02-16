/**
 * Shared Types for Exercise Library Collection
 *
 * Core type definitions used across all collection, analysis, and processing scripts.
 */

// =============================================================================
// Source & Equipment Identifiers
// =============================================================================

export type SourceId = 'exercisedb' | 'wger' | 'manual' | 'deep-research';

export type EquipmentCategory =
  | 'cable'
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'bodyweight'
  | 'band'
  | 'kettlebell'
  | 'other';

// =============================================================================
// Muscle Groups (superset of mobile app's MuscleGroup enum)
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
// Movement Patterns (aligned with mobile app's MovementPattern type)
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
// Exercise Metadata (Phase 0 - lightweight for exploration)
// =============================================================================

export interface ExerciseMetadata {
  /** ID from the source API */
  sourceId: string;
  /** Which source this came from */
  source: SourceId;
  /** Exercise name */
  name: string;
  /** Equipment strings (raw from source, not yet normalized) */
  equipment: string[];
  /** Primary muscle groups (raw from source) */
  muscleGroups: string[];
  /** Secondary muscle groups (raw from source) */
  secondaryMuscleGroups: string[];
  /** Body part / category (raw from source) */
  bodyPart?: string;
  /** Source category */
  category?: string;
}

// =============================================================================
// Equipment Info
// =============================================================================

export interface EquipmentInfo {
  name: string;
  category: EquipmentCategory;
  cableEquivalent: boolean;
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
// Media
// =============================================================================

export interface MediaLink {
  url: string;
  type: 'image' | 'video' | 'gif';
  description?: string;
  source?: string;
}

// =============================================================================
// Training Data
// =============================================================================

export interface IntensityGuideline {
  intensityRange: { min: number; max: number };
  repRange: { min: number; max: number };
  purpose: 'strength' | 'hypertrophy' | 'endurance' | 'power';
}

export interface VBTData {
  minVelocityThreshold?: number;
  velocity1RM?: number;
  loadVelocityProfile?: LoadVelocityPoint[];
}

export interface LoadVelocityPoint {
  load: number;
  velocity: number;
}

export interface TempoParts {
  eccentric: number;
  holdBottom: number;
  concentric: number;
  holdTop: number;
}

// =============================================================================
// Normalized Exercise (full detail, unified schema)
// =============================================================================

export interface NormalizedExercise {
  /** Unique slug ID (e.g., "cable_row", "barbell_bench_press") */
  id: string;
  /** Display name */
  name: string;
  /** Alternative names */
  aliases: string[];

  /** Primary muscle groups */
  muscleGroups: MuscleGroupId[];
  /** Secondary muscle groups */
  secondaryMuscleGroups: MuscleGroupId[];
  /** Movement pattern */
  movementPattern: MovementPatternId;
  /** Compound vs isolation */
  exerciseType: 'compound' | 'isolation';

  /** Equipment required */
  equipment: EquipmentInfo[];
  /** Whether this can be done with cables */
  cableEquivalent: boolean;
  /** Cable setup details */
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

  /** Media links */
  images: MediaLink[];
  videos: MediaLink[];
  gifs: MediaLink[];

  /** Training data */
  defaultTempo?: TempoParts;
  rangeOfMotionNotes?: string;
  intensityGuidelines: IntensityGuideline[];
  vbtData?: VBTData;

  /** Source tracking */
  sources: ExerciseSource[];

  /** Scoring */
  qualityScore: number;
  popularityScore: number;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

/** Tracks which source contributed data */
export interface ExerciseSource {
  source: SourceId;
  sourceId: string;
  sourceUrl?: string;
  fieldsContributed: string[];
}

// =============================================================================
// Analysis Results
// =============================================================================

export interface EquipmentDistribution {
  equipment: string;
  category: EquipmentCategory;
  count: number;
  percentage: number;
  cableEquivalent: boolean;
}

export interface PopularityScore {
  sourceId: string;
  source: SourceId;
  name: string;
  score: number;
  crossSourceCount: number;
  muscleGroupCoverage: number;
  equipmentAvailability: number;
}

export interface FilterResult {
  totalAnalyzed: number;
  totalPassed: number;
  exercises: ExerciseMetadata[];
  filterCriteria: FilterCriteria;
}

export interface FilterCriteria {
  cableEquivalentOnly: boolean;
  minPopularityScore: number;
  ensureMuscleCoverage: boolean;
  compoundIsolationBalance: boolean;
  maxExercises: number;
}

// =============================================================================
// Source-Specific API Response Types
// =============================================================================

/** ExerciseDB API exercise response */
export interface ExerciseDBExercise {
  bodyPart: string;
  equipment: string;
  gifUrl: string;
  id: string;
  name: string;
  target: string;
  secondaryMuscles: string[];
  instructions: string[];
}

/** WGER API exercise response */
export interface WgerExercise {
  id: number;
  uuid: string;
  name: string;
  exercise_base_id: number;
  description: string;
  creation_date: string;
  category: number;
  muscles: WgerMuscle[];
  muscles_secondary: WgerMuscle[];
  equipment: WgerEquipment[];
  variations: number | null;
  images: WgerImage[];
}

export interface WgerMuscle {
  id: number;
  name: string;
  name_en: string;
  is_front: boolean;
  image_url_main: string;
  image_url_secondary: string;
}

export interface WgerEquipment {
  id: number;
  name: string;
}

export interface WgerImage {
  id: number;
  uuid: string;
  exercise_base: number;
  image: string;
  is_main: boolean;
}

/** WGER paginated response */
export interface WgerPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** WGER exercise info endpoint (richer data) */
export interface WgerExerciseInfo {
  id: number;
  uuid: string;
  category: WgerCategory;
  muscles: WgerMuscle[];
  muscles_secondary: WgerMuscle[];
  equipment: WgerEquipment[];
  images: WgerImage[];
  translations: WgerTranslation[];
  variations: number[];
}

export interface WgerTranslation {
  id: number;
  uuid: string;
  name: string;
  exercise: number;
  description: string;
  language: number;
  aliases: string[];
  notes: string[];
}

export interface WgerCategory {
  id: number;
  name: string;
}
