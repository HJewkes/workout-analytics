/**
 * Metadata Collector
 *
 * Fetches lightweight exercise metadata from all sources.
 * Phase 0 only needs names, equipment, and muscle groups — not full details.
 */

import type {
  ExerciseMetadata,
  ExerciseDBExercise,
  WgerExerciseInfo,
  WgerPaginatedResponse,
} from '../../shared/types.js';
import { fetchJSON, fetchAllPages, log, sleep, dataPath, writeJSON, dataExists } from '../../shared/utils.js';

// =============================================================================
// ExerciseDB Metadata Collection
// =============================================================================

const EXERCISEDB_BASE = 'https://exercisedb-api.vercel.app/api/v1';

export async function collectExerciseDBMetadata(): Promise<ExerciseMetadata[]> {
  log('Collecting metadata from ExerciseDB...');

  const cachePath = dataPath('exercises', 'metadata', 'exercisedb-raw.json');
  if (dataExists(cachePath)) {
    log('  Using cached ExerciseDB data');
    const { default: { readFile } } = await import('node:fs/promises');
    const data = JSON.parse(await readFile(cachePath, 'utf-8')) as ExerciseDBExercise[];
    return data.map(exerciseDBToMetadata);
  }

  try {
    const response = await fetchJSON<{ data: ExerciseDBExercise[] }>(
      `${EXERCISEDB_BASE}/exercises?limit=2000&offset=0`,
    );

    const exercises = response.data ?? [];
    log(`  Fetched ${exercises.length} exercises from ExerciseDB`);

    await writeJSON(cachePath, exercises);

    return exercises.map(exerciseDBToMetadata);
  } catch (error) {
    log(`  ExerciseDB API error: ${error instanceof Error ? error.message : String(error)}`);
    log('  Trying alternative ExerciseDB endpoint...');

    try {
      const response = await fetchJSON<ExerciseDBExercise[] | { data: ExerciseDBExercise[] }>(
        `${EXERCISEDB_BASE}/exercises`,
      );

      const exercises = Array.isArray(response) ? response : (response.data ?? []);
      log(`  Fetched ${exercises.length} exercises from ExerciseDB (alt)`);

      await writeJSON(cachePath, exercises);
      return exercises.map(exerciseDBToMetadata);
    } catch (altError) {
      log(`  ExerciseDB unavailable: ${altError instanceof Error ? altError.message : String(altError)}`);
      return [];
    }
  }
}

function exerciseDBToMetadata(ex: ExerciseDBExercise): ExerciseMetadata {
  return {
    sourceId: ex.id,
    source: 'exercisedb',
    name: ex.name,
    equipment: ex.equipment ? [ex.equipment] : [],
    muscleGroups: ex.target ? [ex.target] : [],
    secondaryMuscleGroups: ex.secondaryMuscles ?? [],
    bodyPart: ex.bodyPart,
    category: ex.bodyPart,
  };
}

// =============================================================================
// WGER Metadata Collection
// =============================================================================

const WGER_BASE = 'https://wger.de/api/v2';

export async function collectWgerMetadata(): Promise<ExerciseMetadata[]> {
  log('Collecting metadata from WGER...');

  const cachePath = dataPath('exercises', 'metadata', 'wger-raw.json');
  if (dataExists(cachePath)) {
    log('  Using cached WGER data');
    const { default: { readFile } } = await import('node:fs/promises');
    const data = JSON.parse(await readFile(cachePath, 'utf-8')) as WgerExerciseInfo[];
    return data.map(wgerToMetadata);
  }

  try {
    const exercises = await fetchAllPages<WgerExerciseInfo>(
      `${WGER_BASE}/exerciseinfo/`,
      { format: 'json', language: '2' },
      { rateLimit: 200 },
    );

    log(`  Fetched ${exercises.length} exercises from WGER`);

    await writeJSON(cachePath, exercises);

    return exercises.map(wgerToMetadata);
  } catch (error) {
    log(`  WGER API error: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function wgerToMetadata(ex: WgerExerciseInfo): ExerciseMetadata {
  // Extract English translation (language 2)
  const enTranslation = ex.translations?.find((t) => t.language === 2);
  const name = enTranslation?.name ?? '';
  const description = enTranslation?.description ?? '';

  return {
    sourceId: String(ex.id),
    source: 'wger',
    name,
    equipment: ex.equipment?.map((e) => e.name) ?? [],
    muscleGroups: ex.muscles?.map((m) => m.name_en || m.name) ?? [],
    secondaryMuscleGroups: ex.muscles_secondary?.map((m) => m.name_en || m.name) ?? [],
    bodyPart: ex.category?.name,
    category: ex.category?.name,
  };
}

// =============================================================================
// Combined Collection
// =============================================================================

export async function collectAllMetadata(): Promise<ExerciseMetadata[]> {
  const [exerciseDB, wger] = await Promise.all([
    collectExerciseDBMetadata(),
    collectWgerMetadata(),
  ]);

  // Filter out exercises with empty/missing names
  const all = [...exerciseDB, ...wger].filter(
    (ex) => ex.name && ex.name.trim().length > 0,
  );
  log(`Total metadata collected: ${all.length} (ExerciseDB: ${exerciseDB.length}, WGER: ${wger.length})`);

  await writeJSON(dataPath('exercises', 'metadata', 'all-metadata.json'), all);

  return all;
}
