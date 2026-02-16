/**
 * Filtering Recommendations Report
 *
 * Generates recommendations for which exercises to collect
 * based on the Phase 0 analysis results.
 */

import type { ExerciseMetadata, FilterResult, PopularityScore } from '../../shared/types.js';
import { logSection, logTable, log, dataPath, writeJSON } from '../../shared/utils.js';
import { isCableCompatible } from '../analyzers/cable-equivalence.js';
import { categorizeEquipment } from '../analyzers/equipment-analyzer.js';
import { getMuscleCoverage } from '../filters/exercise-filter.js';

// =============================================================================
// Recommendation Report
// =============================================================================

/**
 * Print filtering recommendations.
 */
export function printFilteringRecommendations(
  filterResult: FilterResult,
  allExercises: ExerciseMetadata[],
): void {
  logSection('FILTERING RECOMMENDATIONS');

  const { exercises: filtered, totalAnalyzed, totalPassed, filterCriteria } = filterResult;

  // Summary
  log('Filter Summary:');
  console.log(`  Total analyzed:          ${totalAnalyzed}`);
  console.log(`  Passed filters:          ${totalPassed} (${pct(totalPassed, totalAnalyzed)})`);
  console.log(`  Filtered out:            ${totalAnalyzed - totalPassed}`);
  console.log();

  // Filter criteria used
  log('Filter Criteria:');
  console.log(`  Cable-equivalent only:   ${filterCriteria.cableEquivalentOnly}`);
  console.log(`  Min popularity score:    ${filterCriteria.minPopularityScore}`);
  console.log(`  Ensure muscle coverage:  ${filterCriteria.ensureMuscleCoverage}`);
  console.log(`  Max exercises:           ${filterCriteria.maxExercises}`);
  console.log();

  // Equipment breakdown of filtered set
  printFilteredEquipmentBreakdown(filtered);

  // Muscle coverage of filtered set
  printFilteredMuscleCoverage(filtered);

  // Cable compatibility of filtered set
  printFilteredCableStats(filtered);

  // Recommendations
  printRecommendations(filtered, totalAnalyzed);
}

function printFilteredEquipmentBreakdown(exercises: ExerciseMetadata[]): void {
  const equipmentCounts: Record<string, number> = {};
  for (const ex of exercises) {
    for (const eq of ex.equipment) {
      const cat = categorizeEquipment(eq);
      equipmentCounts[cat] = (equipmentCounts[cat] ?? 0) + 1;
    }
  }

  log('Filtered Set - Equipment Breakdown:');
  logTable(
    ['Category', 'Count', 'Pct'],
    Object.entries(equipmentCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => [cat, String(count), pct(count, exercises.length)]),
  );
  console.log();
}

function printFilteredMuscleCoverage(exercises: ExerciseMetadata[]): void {
  const coverage = getMuscleCoverage(exercises);

  log('Filtered Set - Muscle Group Coverage (top 20):');
  logTable(
    ['Muscle Group', 'Count'],
    Object.entries(coverage)
      .slice(0, 20)
      .map(([mg, count]) => [mg, String(count)]),
  );
  console.log();
}

function printFilteredCableStats(exercises: ExerciseMetadata[]): void {
  let cableCompatible = 0;
  let directCable = 0;

  for (const ex of exercises) {
    if (isCableCompatible(ex)) {
      cableCompatible++;
      if (ex.equipment.some((e) => categorizeEquipment(e) === 'cable')) {
        directCable++;
      }
    }
  }

  log('Filtered Set - Cable Compatibility:');
  console.log(`  Cable-compatible:        ${cableCompatible} (${pct(cableCompatible, exercises.length)})`);
  console.log(`  Direct cable:            ${directCable}`);
  console.log(`  Adaptable to cable:      ${cableCompatible - directCable}`);
  console.log();
}

function printRecommendations(
  filtered: ExerciseMetadata[],
  totalAnalyzed: number,
): void {
  log('Recommendations:');

  if (filtered.length < 100) {
    console.log('  - Consider lowering the popularity threshold to get more exercises');
  }

  if (filtered.length > 500) {
    console.log('  - Consider raising the popularity threshold to reduce collection scope');
  }

  const cableCompatible = filtered.filter(isCableCompatible).length;
  const cablePct = filtered.length > 0 ? (cableCompatible / filtered.length) * 100 : 0;

  if (cablePct < 50) {
    console.log('  - Cable-compatible exercises are under 50% — consider enabling cable-only filter');
  }

  if (cablePct >= 70) {
    console.log('  - Good cable coverage (70%+) — suitable for Voltra device integration');
  }

  console.log(`  - Recommended next step: Run full collection for ${filtered.length} exercises`);
  console.log();
}

/**
 * Save the filtered exercise list for use by the collection pipeline.
 */
export async function saveFilteredList(
  filterResult: FilterResult,
  popularityScores: PopularityScore[],
): Promise<void> {
  // Create a lookup of popularity scores
  const scoreMap = new Map<string, number>();
  for (const s of popularityScores) {
    scoreMap.set(`${s.source}:${s.sourceId}`, s.score);
  }

  // Enrich filtered list with popularity scores
  const enrichedList = filterResult.exercises.map((ex) => ({
    ...ex,
    popularityScore: scoreMap.get(`${ex.source}:${ex.sourceId}`) ?? 0,
    cableCompatible: isCableCompatible(ex),
  }));

  // Sort by popularity
  enrichedList.sort((a, b) => b.popularityScore - a.popularityScore);

  await writeJSON(dataPath('exercises', 'filtered', 'prioritized-exercises.json'), {
    generatedAt: new Date().toISOString(),
    filterCriteria: filterResult.filterCriteria,
    totalAnalyzed: filterResult.totalAnalyzed,
    totalPassed: filterResult.totalPassed,
    exercises: enrichedList,
  });

  log(`Filtered list saved: ${enrichedList.length} exercises → data/exercises/filtered/prioritized-exercises.json`);
}

// =============================================================================
// Helpers
// =============================================================================

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}
