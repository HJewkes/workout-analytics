/**
 * Exercise Enricher
 *
 * Adds missing fields to exercises using:
 * - Cable equivalence analysis
 * - Movement pattern inference
 * - Default intensity guidelines
 * - ChatGPT Deep Research results (when available)
 */

import type {
  NormalizedExercise,
  CableSetup,
  IntensityGuideline,
  MovementPatternId,
} from '../shared/types.js';
import { log } from '../shared/utils.js';
import { isCableCompatible, getCableSetup } from '../analyze/analyzers/cable-equivalence.js';

// =============================================================================
// Enrichment Pipeline
// =============================================================================

export interface EnrichmentResult {
  enriched: NormalizedExercise[];
  stats: {
    total: number;
    cableSetupAdded: number;
    intensityGuidelinesAdded: number;
    descriptionEnriched: number;
  };
}

/**
 * Run the enrichment pipeline on a set of exercises.
 */
export function enrichExercises(exercises: NormalizedExercise[]): EnrichmentResult {
  log(`Enriching ${exercises.length} exercises...`);

  let cableSetupAdded = 0;
  let intensityGuidelinesAdded = 0;
  let descriptionEnriched = 0;

  const enriched = exercises.map((ex) => {
    let updated = { ...ex };

    // Add cable setup if missing
    if (!updated.cableSetup && updated.cableEquivalent) {
      const metadata = {
        sourceId: ex.id,
        source: ex.sources[0]?.source ?? 'manual' as const,
        name: ex.name,
        equipment: ex.equipment.map((e) => e.name),
        muscleGroups: ex.muscleGroups,
        secondaryMuscleGroups: ex.secondaryMuscleGroups,
        bodyPart: undefined,
        category: undefined,
      };

      const setup = getCableSetup(metadata);
      if (setup) {
        updated = { ...updated, cableSetup: setup };
        cableSetupAdded++;
      }
    }

    // Add default intensity guidelines if missing
    if (updated.intensityGuidelines.length === 0) {
      const guidelines = getDefaultIntensityGuidelines(updated.movementPattern, updated.exerciseType);
      if (guidelines.length > 0) {
        updated = { ...updated, intensityGuidelines: guidelines };
        intensityGuidelinesAdded++;
      }
    }

    // Ensure cable equivalence flag is set correctly
    if (!updated.cableEquivalent) {
      const metadata = {
        sourceId: ex.id,
        source: ex.sources[0]?.source ?? 'manual' as const,
        name: ex.name,
        equipment: ex.equipment.map((e) => e.name),
        muscleGroups: ex.muscleGroups,
        secondaryMuscleGroups: ex.secondaryMuscleGroups,
        bodyPart: undefined,
        category: undefined,
      };
      updated = { ...updated, cableEquivalent: isCableCompatible(metadata) };
    }

    return updated;
  });

  log(`Enrichment complete: ${cableSetupAdded} cable setups, ${intensityGuidelinesAdded} intensity guidelines`);

  return {
    enriched,
    stats: {
      total: exercises.length,
      cableSetupAdded,
      intensityGuidelinesAdded,
      descriptionEnriched,
    },
  };
}

// =============================================================================
// Default Intensity Guidelines
// =============================================================================

/**
 * Get default intensity guidelines based on movement pattern and exercise type.
 */
function getDefaultIntensityGuidelines(
  pattern: MovementPatternId,
  exerciseType: 'compound' | 'isolation',
): IntensityGuideline[] {
  if (exerciseType === 'compound') {
    return COMPOUND_GUIDELINES;
  }

  return ISOLATION_GUIDELINES;
}

const COMPOUND_GUIDELINES: IntensityGuideline[] = [
  {
    intensityRange: { min: 85, max: 100 },
    repRange: { min: 1, max: 5 },
    purpose: 'strength',
  },
  {
    intensityRange: { min: 67, max: 85 },
    repRange: { min: 5, max: 12 },
    purpose: 'hypertrophy',
  },
  {
    intensityRange: { min: 50, max: 67 },
    repRange: { min: 12, max: 20 },
    purpose: 'endurance',
  },
  {
    intensityRange: { min: 30, max: 60 },
    repRange: { min: 1, max: 5 },
    purpose: 'power',
  },
];

const ISOLATION_GUIDELINES: IntensityGuideline[] = [
  {
    intensityRange: { min: 70, max: 85 },
    repRange: { min: 6, max: 12 },
    purpose: 'hypertrophy',
  },
  {
    intensityRange: { min: 50, max: 70 },
    repRange: { min: 12, max: 20 },
    purpose: 'endurance',
  },
];

// =============================================================================
// Deep Research Integration
// =============================================================================

/**
 * Merge ChatGPT Deep Research results into exercises.
 * Deep Research results should be stored as JSON in data/exercises/research/.
 */
export interface DeepResearchResult {
  exerciseId: string;
  description?: string;
  formCues?: string[];
  commonMistakes?: string[];
  tips?: string[];
  vbtNotes?: string;
}

/**
 * Apply Deep Research results to exercises.
 */
export function applyDeepResearch(
  exercises: NormalizedExercise[],
  research: DeepResearchResult[],
): NormalizedExercise[] {
  const researchMap = new Map<string, DeepResearchResult>();
  for (const r of research) {
    researchMap.set(r.exerciseId, r);
  }

  return exercises.map((ex) => {
    const r = researchMap.get(ex.id);
    if (!r) return ex;

    return {
      ...ex,
      description: r.description ?? ex.description,
      formCues: r.formCues ?? ex.formCues,
      commonMistakes: r.commonMistakes ?? ex.commonMistakes,
      tips: r.tips ?? ex.tips,
      updatedAt: new Date().toISOString(),
      sources: [
        ...ex.sources,
        {
          source: 'deep-research' as const,
          sourceId: ex.id,
          fieldsContributed: [
            ...(r.description ? ['description'] : []),
            ...(r.formCues ? ['formCues'] : []),
            ...(r.commonMistakes ? ['commonMistakes'] : []),
            ...(r.tips ? ['tips'] : []),
          ],
        },
      ],
    };
  });
}
