/**
 * Exercise Enrichment via Deep Research
 *
 * Generates structured prompts for ChatGPT Deep Research and
 * processes the results back into the exercise pipeline.
 *
 * Usage: npx tsx scripts/research/exercise-enrichment.ts [--generate-prompts] [--process-results]
 */

import type { NormalizedExercise } from '../shared/types.js';
import type { DeepResearchResult } from '../process/enricher.js';
import { logSection, log, dataPath, writeJSON, readJSON, dataExists } from '../shared/utils.js';

// =============================================================================
// Prompt Generation
// =============================================================================

const BATCH_SIZE = 25;

/**
 * Generate enrichment prompts for a batch of exercises.
 */
function generateEnrichmentPrompt(exercises: NormalizedExercise[], batchIndex: number): string {
  const exerciseList = exercises
    .map((ex) => `- ${ex.id}: "${ex.name}" | Equipment: ${ex.equipment.map((e) => e.name).join(', ') || 'none'} | Muscles: ${ex.muscleGroups.join(', ') || 'unknown'}`)
    .join('\n');

  return `# Exercise Enrichment Batch ${batchIndex + 1}

I'm building an exercise database for a cable machine fitness app. For each exercise listed below, please provide:

1. **Description** (2-3 sentences): What the exercise is, what muscle groups it targets, and why it's effective.
2. **Instructions** (3-6 numbered steps): Step-by-step execution instructions.
3. **Form Cues** (3-5 bullet points): Key cues a coach would give for proper form.
4. **Common Mistakes** (2-4 bullet points): Most common form errors and how to avoid them.
5. **Tips** (1-3 bullet points): Pro tips for getting more out of the exercise.

Focus on cable machine and cable-equivalent versions where applicable. Give practical, actionable coaching cues.

Format the response as a JSON array:
[
  {
    "exerciseId": "<slug_id>",
    "description": "...",
    "instructions": ["Step 1...", "Step 2..."],
    "formCues": ["Cue 1...", "Cue 2..."],
    "commonMistakes": ["Mistake 1...", "Mistake 2..."],
    "tips": ["Tip 1...", "Tip 2..."]
  }
]

Exercises to enrich:
${exerciseList}
`;
}

/**
 * Generate VBT research prompts for a batch of exercises.
 */
function generateVBTPrompt(exercises: NormalizedExercise[], batchIndex: number): string {
  const exerciseList = exercises
    .map((ex) => `- ${ex.id}: "${ex.name}" | Pattern: ${ex.movementPattern} | Type: ${ex.exerciseType}`)
    .join('\n');

  return `# VBT Data Research Batch ${batchIndex + 1}

I'm building a velocity-based training (VBT) system for cable machines. For each exercise below, please research and provide:

1. **Minimum Velocity Threshold (MVT)**: The velocity at 1RM (m/s)
2. **Load-Velocity Data Points**: Mean concentric velocity at various %1RM

Cite sources where possible. Use published VBT research, practical values from VBT coaches, and cable-specific data if available.

Format as JSON:
[
  {
    "exerciseId": "<slug_id>",
    "mvt": <number>,
    "loadVelocityProfile": [
      { "percentRM": 40, "velocity": 1.2 },
      { "percentRM": 60, "velocity": 0.8 }
    ],
    "sources": ["Author et al., Year"],
    "notes": "Any caveats"
  }
]

Exercises:
${exerciseList}
`;
}

// =============================================================================
// Prompt Generation Command
// =============================================================================

async function generatePrompts(): Promise<void> {
  logSection('GENERATING DEEP RESEARCH PROMPTS');

  // Load exercises to enrich
  let exercises: NormalizedExercise[] = [];

  // Try normalized exercises first, then filtered list
  const normalizedPath = dataPath('exercises', 'normalized', 'exercises.json');
  const rawPath = dataPath('exercises', 'raw', 'all-exercises.json');

  if (dataExists(normalizedPath)) {
    exercises = await readJSON<NormalizedExercise[]>(normalizedPath);
    log(`Loaded ${exercises.length} normalized exercises`);
  } else if (dataExists(rawPath)) {
    exercises = await readJSON<NormalizedExercise[]>(rawPath);
    log(`Loaded ${exercises.length} raw exercises`);
  } else {
    log('No exercises found. Run collection pipeline first.');
    process.exit(1);
  }

  // Filter to exercises needing enrichment (missing description or form cues)
  const needsEnrichment = exercises.filter(
    (ex) => !ex.description || !ex.formCues || ex.formCues.length === 0,
  );
  log(`${needsEnrichment.length} exercises need enrichment`);

  // Generate enrichment prompts in batches
  const enrichmentPrompts: string[] = [];
  for (let i = 0; i < needsEnrichment.length; i += BATCH_SIZE) {
    const batch = needsEnrichment.slice(i, i + BATCH_SIZE);
    enrichmentPrompts.push(generateEnrichmentPrompt(batch, Math.floor(i / BATCH_SIZE)));
  }

  // Generate VBT prompts for compound exercises
  const needsVBT = exercises.filter(
    (ex) => !ex.vbtData && ex.exerciseType === 'compound',
  );
  log(`${needsVBT.length} exercises need VBT data`);

  const vbtPrompts: string[] = [];
  for (let i = 0; i < needsVBT.length; i += 15) {
    const batch = needsVBT.slice(i, i + 15);
    vbtPrompts.push(generateVBTPrompt(batch, Math.floor(i / 15)));
  }

  // Save prompts
  const promptsDir = dataPath('exercises', 'research', 'prompts');
  for (let i = 0; i < enrichmentPrompts.length; i++) {
    await writeJSON(
      `${promptsDir}/enrichment-batch-${i + 1}.md`,
      enrichmentPrompts[i],
    );
  }

  for (let i = 0; i < vbtPrompts.length; i++) {
    await writeJSON(
      `${promptsDir}/vbt-batch-${i + 1}.md`,
      vbtPrompts[i],
    );
  }

  log(`Generated ${enrichmentPrompts.length} enrichment prompts and ${vbtPrompts.length} VBT prompts`);
  log(`Prompts saved to data/exercises/research/prompts/`);
  log('Submit these to ChatGPT Deep Research, then save results to data/exercises/research/deep-research-results.json');
}

// =============================================================================
// Result Processing Command
// =============================================================================

async function processResults(): Promise<void> {
  logSection('PROCESSING DEEP RESEARCH RESULTS');

  const resultsPath = dataPath('exercises', 'research', 'deep-research-results.json');
  if (!dataExists(resultsPath)) {
    log('No Deep Research results found at data/exercises/research/deep-research-results.json');
    log('Run --generate-prompts first, submit to ChatGPT, then save results.');
    process.exit(1);
  }

  const results = await readJSON<DeepResearchResult[]>(resultsPath);
  log(`Loaded ${results.length} Deep Research results`);

  // Validate results
  let valid = 0;
  let invalid = 0;
  for (const result of results) {
    if (result.exerciseId && (result.description || result.formCues)) {
      valid++;
    } else {
      invalid++;
      log(`  Invalid result for: ${result.exerciseId ?? 'unknown'}`);
    }
  }

  log(`Valid: ${valid}, Invalid: ${invalid}`);
  log('Results will be applied during the processing pipeline (npx tsx scripts/process/index.ts)');
}

// =============================================================================
// CLI
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--generate-prompts')) {
    await generatePrompts();
  } else if (args.includes('--process-results')) {
    await processResults();
  } else {
    console.log(`
Exercise Enrichment via Deep Research

Usage: npx tsx scripts/research/exercise-enrichment.ts [command]

Commands:
  --generate-prompts    Generate prompts for ChatGPT Deep Research
  --process-results     Validate and prepare Deep Research results
  --help                Show this help message

Workflow:
  1. Run collection pipeline first
  2. Generate prompts: --generate-prompts
  3. Submit prompts to ChatGPT Deep Research
  4. Save results to data/exercises/research/deep-research-results.json
  5. Validate results: --process-results
  6. Run processing pipeline to apply results
`);
  }
}

main().catch((error) => {
  console.error('Research enrichment failed:', error);
  process.exit(1);
});
