/**
 * WGER Collector
 *
 * Collects full exercise data from the WGER REST API.
 * Uses the exerciseinfo endpoint for richer data (includes muscles, equipment, images).
 */

import type {
  WgerExerciseInfo,
  WgerPaginatedResponse,
  NormalizedExercise,
  MuscleGroupId,
  EquipmentInfo,
  MediaLink,
} from '../../shared/types.js';
import { fetchJSON, fetchAllPages, log, toSlug } from '../../shared/utils.js';
import { BaseCollector, type CollectorConfig } from './base-collector.js';
import { categorizeEquipment } from '../../analyze/analyzers/equipment-analyzer.js';
import { mapMuscleGroup } from '../normalizers/muscle-group-mapper.js';
import { inferMovementPattern, inferExerciseType } from '../normalizers/exercise-normalizer.js';

// =============================================================================
// WGER Collector
// =============================================================================

const DEFAULT_WGER_URL = 'https://wger.de/api/v2';

export class WgerCollector extends BaseCollector {
  constructor(config?: Partial<CollectorConfig>) {
    super({
      baseUrl: config?.baseUrl ?? DEFAULT_WGER_URL,
      rateLimit: config?.rateLimit ?? 200,
      ...config,
    });
  }

  get sourceId() {
    return 'wger' as const;
  }

  protected async collectAll(): Promise<NormalizedExercise[]> {
    log('[wger] Fetching all exercises via exerciseinfo endpoint...');

    try {
      const exercises = await fetchAllPages<WgerExerciseInfo>(
        `${this.config.baseUrl}/exerciseinfo/`,
        { format: 'json', language: '2' },
        { rateLimit: this.config.rateLimit, headers: this.config.headers },
      );

      log(`[wger] Received ${exercises.length} exercises`);

      return exercises
        .map((ex) => normalizeWger(ex))
        .filter(Boolean) as NormalizedExercise[];
    } catch (error) {
      this.addError(undefined, `Failed to fetch exercises: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  protected async collectByIds(ids: string[]): Promise<NormalizedExercise[]> {
    const results: NormalizedExercise[] = [];

    for (const id of ids) {
      try {
        const exercise = await fetchJSON<WgerExerciseInfo>(
          `${this.config.baseUrl}/exerciseinfo/${id}/?format=json`,
          this.config.headers,
        );

        const normalized = normalizeWger(exercise);
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

function normalizeWger(raw: WgerExerciseInfo): NormalizedExercise | null {
  // Extract English translation (language 2)
  const enTranslation = raw.translations?.find((t) => t.language === 2);
  const name = enTranslation?.name?.trim();
  if (!name) return null;

  const id = toSlug(name);

  const muscleGroups: MuscleGroupId[] = (raw.muscles ?? [])
    .map((m) => mapMuscleGroup(m.name_en || m.name))
    .filter((m): m is MuscleGroupId => m !== null);

  const secondaryMuscleGroups: MuscleGroupId[] = (raw.muscles_secondary ?? [])
    .map((m) => mapMuscleGroup(m.name_en || m.name))
    .filter((m): m is MuscleGroupId => m !== null);

  const equipment: EquipmentInfo[] = (raw.equipment ?? []).map((eq) => {
    const category = categorizeEquipment(eq.name);
    return {
      name: eq.name,
      category,
      cableEquivalent: category !== 'other',
    };
  });

  const images: MediaLink[] = (raw.images ?? []).map((img) => ({
    url: img.image,
    type: 'image' as const,
    description: img.is_main ? 'Main image' : undefined,
    source: 'wger',
  }));

  const categoryName = raw.category?.name;
  const primaryMuscle = muscleGroups[0];

  // Clean description (remove HTML tags)
  const rawDescription = enTranslation?.description;
  const description = rawDescription
    ? rawDescription.replace(/<[^>]*>/g, '').trim()
    : undefined;

  const now = new Date().toISOString();

  return {
    id,
    name,
    aliases: enTranslation?.aliases ?? [],
    muscleGroups,
    secondaryMuscleGroups,
    movementPattern: inferMovementPattern(name, categoryName, primaryMuscle),
    exerciseType: inferExerciseType(muscleGroups, secondaryMuscleGroups),
    equipment,
    cableEquivalent: equipment.some((e) => e.category === 'cable' || e.cableEquivalent),
    description: description || undefined,
    instructions: description ? [description] : [],
    formCues: undefined,
    commonMistakes: undefined,
    tips: undefined,
    images,
    videos: [],
    gifs: [],
    intensityGuidelines: [],
    sources: [{
      source: 'wger',
      sourceId: String(raw.id),
      sourceUrl: `https://wger.de/api/v2/exerciseinfo/${raw.id}/`,
      fieldsContributed: [
        'name',
        ...(muscleGroups.length > 0 ? ['muscleGroups'] : []),
        ...(equipment.length > 0 ? ['equipment'] : []),
        ...(description ? ['description'] : []),
        ...(images.length > 0 ? ['images'] : []),
        ...(enTranslation?.aliases && enTranslation.aliases.length > 0 ? ['aliases'] : []),
      ],
    }],
    qualityScore: 0,
    popularityScore: 0,
    createdAt: now,
    updatedAt: now,
  };
}
