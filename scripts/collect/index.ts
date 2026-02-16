/**
 * Exercise Collection Pipeline (Phase 1)
 *
 * Collects full exercise data from all sources, optionally filtered
 * by the Phase 0 prioritized exercise list.
 *
 * Usage: npx tsx scripts/collect/index.ts [--source=exercisedb|wger|all] [--use-filter]
 */

import { ExerciseDBCollector } from './collectors/exercisedb-collector.js';
import { WgerCollector } from './collectors/wger-collector.js';
import type { NormalizedExercise, SourceId } from '../shared/types.js';
import { logSection, log, dataPath, writeJSON, readJSON, dataExists } from '../shared/utils.js';

// =============================================================================
// CLI
// =============================================================================

function parseArgs(): { sources: SourceId[]; useFilter: boolean } {
  const args = process.argv.slice(2);
  let sources: SourceId[] = ['exercisedb', 'wger'];
  let useFilter = false;

  for (const arg of args) {
    if (arg.startsWith('--source=')) {
      const source = arg.split('=')[1];
      if (source === 'all') {
        sources = ['exercisedb', 'wger'];
      } else {
        sources = [source as SourceId];
      }
    } else if (arg === '--use-filter') {
      useFilter = true;
    } else if (arg === '--help') {
      console.log(`
Exercise Collection Pipeline (Phase 1)

Usage: npx tsx scripts/collect/index.ts [options]

Options:
  --source=SOURCE   Source to collect from: exercisedb, wger, or all (default: all)
  --use-filter      Only collect exercises from the Phase 0 filtered list
  --help            Show this help message
`);
      process.exit(0);
    }
  }

  return { sources, useFilter };
}

// =============================================================================
// Filter Loading
// =============================================================================

async function loadFilteredIds(): Promise<Map<SourceId, string[]>> {
  const filterPath = dataPath('exercises', 'filtered', 'prioritized-exercises.json');

  if (!dataExists(filterPath)) {
    log('No filtered exercise list found. Run `npx tsx scripts/analyze/index.ts` first.');
    log('Collecting all exercises instead.');
    return new Map();
  }

  const filterData = await readJSON<{
    exercises: Array<{ sourceId: string; source: SourceId }>;
  }>(filterPath);

  const bySource = new Map<SourceId, string[]>();
  for (const ex of filterData.exercises) {
    if (!bySource.has(ex.source)) {
      bySource.set(ex.source, []);
    }
    bySource.get(ex.source)!.push(ex.sourceId);
  }

  log(`Loaded filter: ${filterData.exercises.length} exercises across ${bySource.size} sources`);
  return bySource;
}

// =============================================================================
// Main Pipeline
// =============================================================================

async function main(): Promise<void> {
  const { sources, useFilter } = parseArgs();

  logSection('EXERCISE COLLECTION PIPELINE');
  log(`Sources: ${sources.join(', ')}`);
  log(`Using filter: ${useFilter}`);

  let filteredIds = new Map<SourceId, string[]>();
  if (useFilter) {
    filteredIds = await loadFilteredIds();
  }

  const allExercises: NormalizedExercise[] = [];
  const allStats: Array<{ source: SourceId; count: number; errors: number; durationMs: number }> = [];

  // Collect from each source
  for (const source of sources) {
    logSection(`COLLECTING FROM ${source.toUpperCase()}`);

    const targetIds = filteredIds.get(source);
    const collector = createCollector(source, targetIds);

    if (!collector) {
      log(`Unknown source: ${source}`);
      continue;
    }

    const result = await collector.collect();

    allExercises.push(...result.exercises);
    allStats.push({
      source: result.source,
      count: result.exercises.length,
      errors: result.errors.length,
      durationMs: result.stats.durationMs,
    });

    // Save raw results per source
    await writeJSON(
      dataPath('exercises', 'raw', `${source}.json`),
      result.exercises,
    );

    if (result.errors.length > 0) {
      await writeJSON(
        dataPath('exercises', 'raw', `${source}-errors.json`),
        result.errors,
      );
    }

    log(`[${source}] Saved ${result.exercises.length} exercises, ${result.errors.length} errors`);
  }

  // Save combined results
  await writeJSON(dataPath('exercises', 'raw', 'all-exercises.json'), allExercises);

  // Print summary
  logSection('COLLECTION SUMMARY');
  for (const stat of allStats) {
    log(`${stat.source}: ${stat.count} exercises, ${stat.errors} errors, ${stat.durationMs}ms`);
  }
  log(`Total: ${allExercises.length} exercises collected`);
  log('Next: Run `npx tsx scripts/process/index.ts` to deduplicate and enrich');
}

function createCollector(source: SourceId, targetIds?: string[]) {
  switch (source) {
    case 'exercisedb':
      return new ExerciseDBCollector(targetIds ? { targetIds } : undefined);
    case 'wger':
      return new WgerCollector(targetIds ? { targetIds } : undefined);
    default:
      return null;
  }
}

main().catch((error) => {
  console.error('Collection pipeline failed:', error);
  process.exit(1);
});
