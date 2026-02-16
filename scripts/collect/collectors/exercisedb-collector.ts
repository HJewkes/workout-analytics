/**
 * ExerciseDB Collector
 *
 * Collects full exercise data from the ExerciseDB API.
 * Supports both metadata-only and full-detail collection modes.
 */

import type {
  ExerciseDBExercise,
  NormalizedExercise,
  MuscleGroupId,
  EquipmentInfo,
  MediaLink,
} from '../../shared/types.js';
import { fetchJSON, log, toSlug } from '../../shared/utils.js';
import { BaseCollector, type CollectorConfig } from './base-collector.js';
import { categorizeEquipment } from '../../analyze/analyzers/equipment-analyzer.js';
import { mapMuscleGroup } from '../normalizers/muscle-group-mapper.js';
import { inferMovementPattern, inferExerciseType } from '../normalizers/exercise-normalizer.js';

// =============================================================================
// ExerciseDB Collector
// =============================================================================

const DEFAULT_EXERCISEDB_URL = 'https://exercisedb-api.vercel.app/api/v1';

export class ExerciseDBCollector extends BaseCollector {
  constructor(config?: Partial<CollectorConfig>) {
    super({
      baseUrl: config?.baseUrl ?? DEFAULT_EXERCISEDB_URL,
      rateLimit: config?.rateLimit ?? 200,
      ...config,
    });
  }

  get sourceId() {
    return 'exercisedb' as const;
  }

  protected async collectAll(): Promise<NormalizedExercise[]> {
    log('[exercisedb] Fetching all exercises...');

    try {
      const response = await fetchJSON<ExerciseDBExercise[] | { data: ExerciseDBExercise[] }>(
        `${this.config.baseUrl}/exercises?limit=2000&offset=0`,
        this.config.headers,
      );

      const exercises = Array.isArray(response) ? response : (response.data ?? []);
      log(`[exercisedb] Received ${exercises.length} exercises`);

      return exercises.map((ex) => normalizeExerciseDB(ex)).filter(Boolean) as NormalizedExercise[];
    } catch (error) {
      this.addError(undefined, `Failed to fetch exercises: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  protected async collectByIds(ids: string[]): Promise<NormalizedExercise[]> {
    const results: NormalizedExercise[] = [];

    for (const id of ids) {
      try {
        const response = await fetchJSON<ExerciseDBExercise | { data: ExerciseDBExercise }>(
          `${this.config.baseUrl}/exercises/exercise/${id}`,
          this.config.headers,
        );

        const exercise = 'data' in response ? response.data : response;
        const normalized = normalizeExerciseDB(exercise);
        if (normalized) results.push(normalized);
      } catch (error) {
        this.addError(id, `Failed to fetch exercise ${id}: ${error instanceof Error ? error.message : String(error)}`);
      }

      await this.rateLimitDelay();
    }

    return results;
  }
}

// =============================================================================
// Normalization
// =============================================================================

function normalizeExerciseDB(raw: ExerciseDBExercise): NormalizedExercise | null {
  if (!raw.name) return null;

  const name = raw.name.trim();
  const id = toSlug(name);

  const primaryMuscle = mapMuscleGroup(raw.target);
  const secondaryMuscles = (raw.secondaryMuscles ?? [])
    .map(mapMuscleGroup)
    .filter((m): m is MuscleGroupId => m !== null);

  const muscleGroups: MuscleGroupId[] = primaryMuscle ? [primaryMuscle] : [];

  const equipmentCategory = categorizeEquipment(raw.equipment ?? '');
  const equipment: EquipmentInfo[] = raw.equipment
    ? [{
        name: raw.equipment,
        category: equipmentCategory,
        cableEquivalent: equipmentCategory !== 'other',
      }]
    : [];

  const gifs: MediaLink[] = raw.gifUrl
    ? [{ url: raw.gifUrl, type: 'gif', source: 'exercisedb' }]
    : [];

  const now = new Date().toISOString();

  return {
    id,
    name,
    aliases: [],
    muscleGroups,
    secondaryMuscleGroups: secondaryMuscles,
    movementPattern: inferMovementPattern(name, raw.bodyPart, raw.target),
    exerciseType: inferExerciseType(muscleGroups, secondaryMuscles),
    equipment,
    cableEquivalent: equipmentCategory === 'cable' || equipment.some((e) => e.cableEquivalent),
    description: undefined,
    instructions: raw.instructions ?? [],
    formCues: undefined,
    commonMistakes: undefined,
    tips: undefined,
    images: [],
    videos: [],
    gifs,
    intensityGuidelines: [],
    sources: [{
      source: 'exercisedb',
      sourceId: raw.id,
      fieldsContributed: ['name', 'muscleGroups', 'equipment', 'instructions', 'gifs'],
    }],
    qualityScore: 0,
    popularityScore: 0,
    createdAt: now,
    updatedAt: now,
  };
}
