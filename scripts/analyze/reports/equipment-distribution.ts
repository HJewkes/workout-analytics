/**
 * Equipment Distribution Report
 *
 * Generates human-readable reports about equipment distribution,
 * cable compatibility, and muscle group coverage.
 */

import type { ExerciseMetadata, EquipmentDistribution, PopularityScore } from '../../shared/types.js';
import { logSection, logTable, log, dataPath, writeJSON } from '../../shared/utils.js';
import {
  analyzeEquipmentDistribution,
  getEquipmentByCategory,
  countCableCompatibleExercises,
  getUniqueEquipment,
} from '../analyzers/equipment-analyzer.js';
import { analyzeCableEquivalence } from '../analyzers/cable-equivalence.js';
import { getPopularityStats } from '../analyzers/popularity-analyzer.js';
import { getMuscleCoverage } from '../filters/exercise-filter.js';

// =============================================================================
// Report Generation
// =============================================================================

/**
 * Generate and print the full equipment distribution report.
 */
export function printEquipmentReport(exercises: ExerciseMetadata[]): void {
  logSection('EQUIPMENT DISTRIBUTION REPORT');

  // 1. Overall equipment distribution
  const distribution = analyzeEquipmentDistribution(exercises);
  printEquipmentDistribution(distribution);

  // 2. Equipment by category
  const byCategory = getEquipmentByCategory(distribution);
  printEquipmentByCategory(byCategory);

  // 3. Cable compatibility
  const cableStats = countCableCompatibleExercises(exercises);
  printCableCompatibility(cableStats);

  // 4. Cable equivalence analysis
  const cableAnalysis = analyzeCableEquivalence(exercises);
  printCableEquivalenceAnalysis(cableAnalysis.stats);

  // 5. Unique equipment list
  const uniqueEquipment = getUniqueEquipment(exercises);
  printUniqueEquipment(uniqueEquipment);
}

function printEquipmentDistribution(distribution: EquipmentDistribution[]): void {
  log('Equipment Distribution (top 20):');
  logTable(
    ['Equipment', 'Count', 'Pct', 'Category', 'Cable?'],
    distribution.slice(0, 20).map((d) => [
      d.equipment,
      String(d.count),
      `${d.percentage.toFixed(1)}%`,
      d.category,
      d.cableEquivalent ? 'yes' : 'no',
    ]),
  );
  console.log();
}

function printEquipmentByCategory(
  byCategory: Record<string, { count: number; percentage: number; items: string[] }>,
): void {
  log('Equipment by Category:');
  logTable(
    ['Category', 'Count', 'Pct', 'Items'],
    Object.entries(byCategory)
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([category, data]) => [
        category,
        String(data.count),
        `${data.percentage.toFixed(1)}%`,
        data.items.slice(0, 5).join(', ') + (data.items.length > 5 ? '...' : ''),
      ]),
  );
  console.log();
}

function printCableCompatibility(stats: {
  directCable: number;
  cableEquivalent: number;
  notCableCompatible: number;
  total: number;
}): void {
  log('Cable Compatibility Summary:');
  console.log(`  Total exercises:          ${stats.total}`);
  console.log(`  Direct cable:             ${stats.directCable} (${pct(stats.directCable, stats.total)})`);
  console.log(`  Cable-equivalent:         ${stats.cableEquivalent} (${pct(stats.cableEquivalent, stats.total)})`);
  console.log(`  Not cable-compatible:     ${stats.notCableCompatible} (${pct(stats.notCableCompatible, stats.total)})`);
  console.log(`  Total cable-usable:       ${stats.directCable + stats.cableEquivalent} (${pct(stats.directCable + stats.cableEquivalent, stats.total)})`);
  console.log();
}

function printCableEquivalenceAnalysis(stats: {
  total: number;
  compatible: number;
  incompatible: number;
  directCable: number;
  adaptable: number;
}): void {
  log('Cable Equivalence Analysis:');
  console.log(`  Compatible exercises:     ${stats.compatible} (${pct(stats.compatible, stats.total)})`);
  console.log(`    - Direct cable:         ${stats.directCable}`);
  console.log(`    - Adaptable to cable:   ${stats.adaptable}`);
  console.log(`  Incompatible exercises:   ${stats.incompatible} (${pct(stats.incompatible, stats.total)})`);
  console.log();
}

function printUniqueEquipment(equipment: string[]): void {
  log(`Unique Equipment Types (${equipment.length} total):`);
  for (const eq of equipment) {
    console.log(`  - ${eq}`);
  }
  console.log();
}

/**
 * Generate and print muscle group coverage report.
 */
export function printMuscleCoverageReport(exercises: ExerciseMetadata[]): void {
  logSection('MUSCLE GROUP COVERAGE REPORT');

  const coverage = getMuscleCoverage(exercises);

  log('Muscle Group Coverage:');
  logTable(
    ['Muscle Group', 'Exercise Count'],
    Object.entries(coverage).map(([mg, count]) => [mg, String(count)]),
  );
  console.log();
}

/**
 * Generate and print popularity report.
 */
export function printPopularityReport(scores: PopularityScore[]): void {
  logSection('POPULARITY REPORT');

  const stats = getPopularityStats(scores);

  log('Popularity Statistics:');
  console.log(`  Total exercises:          ${stats.total}`);
  console.log(`  Mean score:               ${stats.meanScore.toFixed(1)}`);
  console.log(`  Median score:             ${stats.medianScore.toFixed(1)}`);
  console.log(`  Max score:                ${stats.maxScore}`);
  console.log(`  Min score:                ${stats.minScore}`);
  console.log(`  Cross-source exercises:   ${stats.crossSourceExercises}`);
  console.log();

  log('By Source:');
  for (const [source, count] of Object.entries(stats.bySource)) {
    console.log(`  ${source}: ${count} exercises`);
  }
  console.log();

  log('Top 30 Exercises by Popularity:');
  logTable(
    ['#', 'Name', 'Score', 'Source', 'Cross-Src'],
    scores.slice(0, 30).map((s, i) => [
      String(i + 1),
      s.name.slice(0, 50),
      String(s.score),
      s.source,
      String(s.crossSourceCount),
    ]),
  );
  console.log();
}

/**
 * Save full report data as JSON for later use.
 */
export async function saveReportData(
  exercises: ExerciseMetadata[],
  scores: PopularityScore[],
): Promise<void> {
  const distribution = analyzeEquipmentDistribution(exercises);
  const cableAnalysis = analyzeCableEquivalence(exercises);
  const popularityStats = getPopularityStats(scores);
  const muscleCoverage = getMuscleCoverage(exercises);

  const report = {
    generatedAt: new Date().toISOString(),
    exerciseCount: exercises.length,
    equipmentDistribution: distribution,
    cableAnalysis: {
      stats: cableAnalysis.stats,
      compatibleCount: cableAnalysis.compatible.length,
      incompatibleCount: cableAnalysis.incompatible.length,
    },
    popularityStats,
    muscleCoverage,
  };

  await writeJSON(dataPath('exercises', 'metadata', 'analysis-report.json'), report);
  log('Report data saved to data/exercises/metadata/analysis-report.json');
}

// =============================================================================
// Helpers
// =============================================================================

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}
