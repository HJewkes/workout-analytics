/**
 * Exercise Processing Pipeline
 *
 * Deduplicates, enriches, and scores collected exercises.
 *
 * Usage: npx tsx scripts/process/index.ts
 */

import type { NormalizedExercise } from '../shared/types.js';
import { logSection, log, dataPath, writeJSON, readJSON, dataExists } from '../shared/utils.js';
import { deduplicateExercises } from './deduplicator.js';
import { enrichExercises, applyDeepResearch, type DeepResearchResult } from './enricher.js';
import { scoreExercises, generateQualityReport, printQualityReport } from './quality-scorer.js';

// =============================================================================
// Main Pipeline
// =============================================================================

async function main(): Promise<void> {
  logSection('EXERCISE PROCESSING PIPELINE');

  // Load collected exercises
  const rawPath = dataPath('exercises', 'raw', 'all-exercises.json');
  if (!dataExists(rawPath)) {
    log('No collected exercises found. Run `npx tsx scripts/collect/index.ts` first.');
    process.exit(1);
  }

  const raw = await readJSON<NormalizedExercise[]>(rawPath);
  log(`Loaded ${raw.length} collected exercises`);

  // Step 1: Deduplicate
  logSection('STEP 1: DEDUPLICATION');
  const { deduplicated } = deduplicateExercises(raw);

  // Step 2: Enrich
  logSection('STEP 2: ENRICHMENT');
  const { enriched, stats: enrichStats } = enrichExercises(deduplicated);
  log(`Enrichment stats: ${JSON.stringify(enrichStats)}`);

  // Step 3: Apply Deep Research (if available)
  logSection('STEP 3: DEEP RESEARCH');
  const researchPath = dataPath('exercises', 'research', 'deep-research-results.json');
  let processed = enriched;

  if (dataExists(researchPath)) {
    const research = await readJSON<DeepResearchResult[]>(researchPath);
    log(`Applying ${research.length} Deep Research results`);
    processed = applyDeepResearch(enriched, research);
  } else {
    log('No Deep Research results found (optional). Skipping.');
  }

  // Step 4: Score quality
  logSection('STEP 4: QUALITY SCORING');
  const scored = scoreExercises(processed);

  // Sort by quality score (descending)
  scored.sort((a, b) => b.qualityScore - a.qualityScore);

  // Generate quality report
  const report = generateQualityReport(scored);
  printQualityReport(report);

  // Step 5: Save results
  logSection('STEP 5: SAVING');
  await writeJSON(dataPath('exercises', 'normalized', 'exercises.json'), scored);
  await writeJSON(dataPath('exercises', 'normalized', 'quality-report.json'), report);

  logSection('PROCESSING COMPLETE');
  log(`Processed ${scored.length} exercises → data/exercises/normalized/exercises.json`);
  log(`Quality report → data/exercises/normalized/quality-report.json`);
}

main().catch((error) => {
  console.error('Processing pipeline failed:', error);
  process.exit(1);
});
