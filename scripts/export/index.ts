/**
 * Exercise Library Export
 *
 * Exports the normalized exercise database to the src/exercises/
 * module as a TypeScript-importable catalog.
 *
 * Usage: npx tsx scripts/export/index.ts
 */

import type { NormalizedExercise } from '../shared/types.js';
import { logSection, log, dataPath, readJSON, dataExists } from '../shared/utils.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// =============================================================================
// Export Configuration
// =============================================================================

const SRC_ROOT = join(import.meta.dirname, '..', '..', 'src');
const EXERCISES_DIR = join(SRC_ROOT, 'exercises');

// =============================================================================
// Main Export
// =============================================================================

async function main(): Promise<void> {
  logSection('EXERCISE LIBRARY EXPORT');

  // Load normalized exercises
  const normalizedPath = dataPath('exercises', 'normalized', 'exercises.json');
  if (!dataExists(normalizedPath)) {
    log('No normalized exercises found. Run the full pipeline first:');
    log('  1. npx tsx scripts/analyze/index.ts');
    log('  2. npx tsx scripts/collect/index.ts');
    log('  3. npx tsx scripts/process/index.ts');
    process.exit(1);
  }

  const exercises = await readJSON<NormalizedExercise[]>(normalizedPath);
  log(`Loaded ${exercises.length} normalized exercises`);

  // Generate catalog data file
  await mkdir(join(EXERCISES_DIR, 'data'), { recursive: true });
  await generateCatalogData(exercises);
  log('Generated catalog data file');

  logSection('EXPORT COMPLETE');
  log(`Exported ${exercises.length} exercises to src/exercises/data/catalog.json`);
  log('The src/exercises/ module re-exports the catalog for library consumers.');
}

// =============================================================================
// Catalog Data Generation
// =============================================================================

/**
 * Generate the exercise catalog data file.
 * This is a JSON file that gets imported by the catalog module.
 */
async function generateCatalogData(exercises: NormalizedExercise[]): Promise<void> {
  // Slim down exercises for the catalog (remove large fields to reduce bundle size)
  const catalog = exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    aliases: ex.aliases.length > 0 ? ex.aliases : undefined,
    muscleGroups: ex.muscleGroups,
    secondaryMuscleGroups: ex.secondaryMuscleGroups.length > 0 ? ex.secondaryMuscleGroups : undefined,
    movementPattern: ex.movementPattern,
    exerciseType: ex.exerciseType,
    equipment: ex.equipment.map((e) => ({
      name: e.name,
      category: e.category,
    })),
    cableEquivalent: ex.cableEquivalent,
    cableSetup: ex.cableSetup,
    description: ex.description,
    instructions: ex.instructions,
    formCues: ex.formCues,
    commonMistakes: ex.commonMistakes,
    tips: ex.tips,
    qualityScore: ex.qualityScore,
  }));

  const outputPath = join(EXERCISES_DIR, 'data', 'catalog.json');
  await writeFile(outputPath, JSON.stringify(catalog, null, 2) + '\n', 'utf-8');
}

main().catch((error) => {
  console.error('Export failed:', error);
  process.exit(1);
});
