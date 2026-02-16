/**
 * Exercise Library Analysis Pipeline (Phase 0)
 *
 * Collects lightweight metadata from all sources, analyzes equipment
 * distribution, cable compatibility, and popularity, then generates
 * a prioritized list of exercises for full collection.
 *
 * Usage: npx tsx scripts/analyze/index.ts [--cable-only] [--max=N] [--min-score=N]
 */

import { collectAllMetadata } from './analyzers/metadata-collector.js';
import { analyzePopularity } from './analyzers/popularity-analyzer.js';
import { filterExercises, buildPopularityMap, DEFAULT_FILTER_CRITERIA } from './filters/exercise-filter.js';
import {
  printEquipmentReport,
  printMuscleCoverageReport,
  printPopularityReport,
  saveReportData,
} from './reports/equipment-distribution.js';
import {
  printFilteringRecommendations,
  saveFilteredList,
} from './reports/filtering-recommendations.js';
import { logSection, log } from '../shared/utils.js';
import type { FilterCriteria } from '../shared/types.js';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): Partial<FilterCriteria> {
  const args = process.argv.slice(2);
  const criteria: Partial<FilterCriteria> = {};

  for (const arg of args) {
    if (arg === '--cable-only') {
      criteria.cableEquivalentOnly = true;
    } else if (arg.startsWith('--max=')) {
      criteria.maxExercises = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--min-score=')) {
      criteria.minPopularityScore = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--help') {
      console.log(`
Exercise Library Analysis Pipeline (Phase 0)

Usage: npx tsx scripts/analyze/index.ts [options]

Options:
  --cable-only      Only include cable-compatible exercises
  --max=N           Maximum number of exercises to keep (default: 500)
  --min-score=N     Minimum popularity score threshold (default: 20)
  --help            Show this help message
`);
      process.exit(0);
    }
  }

  return criteria;
}

// =============================================================================
// Main Pipeline
// =============================================================================

async function main(): Promise<void> {
  const cliCriteria = parseArgs();
  const criteria: FilterCriteria = { ...DEFAULT_FILTER_CRITERIA, ...cliCriteria };

  logSection('EXERCISE LIBRARY ANALYSIS PIPELINE');
  log('Starting Phase 0: Exploration & Analysis');

  // Step 1: Collect metadata from all sources
  logSection('STEP 1: METADATA COLLECTION');
  const allMetadata = await collectAllMetadata();

  if (allMetadata.length === 0) {
    log('No metadata collected. Check API connectivity and try again.');
    process.exit(1);
  }

  // Step 2: Generate equipment report
  printEquipmentReport(allMetadata);

  // Step 3: Generate muscle coverage report
  printMuscleCoverageReport(allMetadata);

  // Step 4: Analyze popularity
  logSection('STEP 4: POPULARITY ANALYSIS');
  const popularityScores = analyzePopularity(allMetadata);
  printPopularityReport(popularityScores);

  // Step 5: Filter exercises
  logSection('STEP 5: FILTERING');
  const popularityMap = buildPopularityMap(popularityScores);
  const filterResult = filterExercises(allMetadata, popularityMap, criteria);
  printFilteringRecommendations(filterResult, allMetadata);

  // Step 6: Save results
  logSection('STEP 6: SAVING RESULTS');
  await saveReportData(allMetadata, popularityScores);
  await saveFilteredList(filterResult, popularityScores);

  logSection('ANALYSIS COMPLETE');
  log(`Analyzed ${allMetadata.length} exercises → ${filterResult.totalPassed} prioritized for collection`);
  log('Next: Run `npx tsx scripts/collect/index.ts` to collect full exercise data');
}

main().catch((error) => {
  console.error('Analysis pipeline failed:', error);
  process.exit(1);
});
