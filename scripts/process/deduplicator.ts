/**
 * Exercise Deduplicator
 *
 * Identifies duplicate exercises across sources using fuzzy name matching
 * and merges them into single entries, combining the best data from each source.
 */

import type { NormalizedExercise, ExerciseSource } from '../shared/types.js';
import { normalizeForComparison, log, unique } from '../shared/utils.js';

// =============================================================================
// Deduplication
// =============================================================================

/**
 * Deduplicate exercises by merging duplicates from different sources.
 * Uses normalized name matching to find duplicates.
 */
export function deduplicateExercises(exercises: NormalizedExercise[]): {
  deduplicated: NormalizedExercise[];
  mergeCount: number;
  totalBefore: number;
} {
  const totalBefore = exercises.length;
  log(`Deduplicating ${totalBefore} exercises...`);

  // Group by normalized name
  const groups = new Map<string, NormalizedExercise[]>();

  for (const ex of exercises) {
    const key = normalizeForComparison(ex.name);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(ex);
  }

  // Merge groups
  const deduplicated: NormalizedExercise[] = [];
  let mergeCount = 0;

  for (const [, group] of groups) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
    } else {
      deduplicated.push(mergeExercises(group));
      mergeCount += group.length - 1;
    }
  }

  log(`Deduplicated: ${totalBefore} → ${deduplicated.length} (merged ${mergeCount} duplicates)`);

  return { deduplicated, mergeCount, totalBefore };
}

// =============================================================================
// Merging Strategy
// =============================================================================

/**
 * Merge multiple exercise entries into one, combining data from all sources.
 * Priority: longer/richer data wins for each field.
 */
function mergeExercises(exercises: NormalizedExercise[]): NormalizedExercise {
  // Sort by data richness (more fields filled = higher priority)
  const sorted = [...exercises].sort((a, b) => scoreRichness(b) - scoreRichness(a));

  const primary = sorted[0];
  const rest = sorted.slice(1);

  // Merge sources
  const allSources: ExerciseSource[] = exercises.flatMap((ex) => ex.sources);

  // Merge aliases
  const allAliases = unique(exercises.flatMap((ex) => [ex.name, ...ex.aliases]));
  const aliases = allAliases.filter((a) => a !== primary.name);

  // Merge muscle groups (union)
  const muscleGroups = unique(exercises.flatMap((ex) => ex.muscleGroups));
  const secondaryMuscleGroups = unique(
    exercises.flatMap((ex) => ex.secondaryMuscleGroups),
  ).filter((mg) => !muscleGroups.includes(mg));

  // Merge equipment (union)
  const equipmentMap = new Map<string, (typeof primary.equipment)[0]>();
  for (const ex of exercises) {
    for (const eq of ex.equipment) {
      if (!equipmentMap.has(eq.name.toLowerCase())) {
        equipmentMap.set(eq.name.toLowerCase(), eq);
      }
    }
  }

  // Merge media (union, deduplicate by URL)
  const imageUrls = new Set<string>();
  const images = exercises.flatMap((ex) => ex.images).filter((img) => {
    if (imageUrls.has(img.url)) return false;
    imageUrls.add(img.url);
    return true;
  });

  const videoUrls = new Set<string>();
  const videos = exercises.flatMap((ex) => ex.videos).filter((vid) => {
    if (videoUrls.has(vid.url)) return false;
    videoUrls.add(vid.url);
    return true;
  });

  const gifUrls = new Set<string>();
  const gifs = exercises.flatMap((ex) => ex.gifs).filter((gif) => {
    if (gifUrls.has(gif.url)) return false;
    gifUrls.add(gif.url);
    return true;
  });

  // Use the longest/best description
  const description = pickBest(exercises.map((ex) => ex.description));

  // Merge instructions (use longest set)
  const instructions = pickBestArray(exercises.map((ex) => ex.instructions));

  // Merge form cues
  const formCues = unique(exercises.flatMap((ex) => ex.formCues ?? []));

  // Merge common mistakes
  const commonMistakes = unique(exercises.flatMap((ex) => ex.commonMistakes ?? []));

  // Merge tips
  const tips = unique(exercises.flatMap((ex) => ex.tips ?? []));

  // Cable setup: prefer the first one found
  const cableSetup = exercises.find((ex) => ex.cableSetup)?.cableSetup;

  // Intensity guidelines: merge
  const intensityGuidelines = exercises.flatMap((ex) => ex.intensityGuidelines);

  // VBT data: prefer any that exists
  const vbtData = exercises.find((ex) => ex.vbtData)?.vbtData;

  const now = new Date().toISOString();

  return {
    id: primary.id,
    name: primary.name,
    aliases,
    muscleGroups,
    secondaryMuscleGroups,
    movementPattern: primary.movementPattern,
    exerciseType: muscleGroups.length + secondaryMuscleGroups.length >= 2 ? 'compound' : 'isolation',
    equipment: [...equipmentMap.values()],
    cableEquivalent: exercises.some((ex) => ex.cableEquivalent),
    cableSetup,
    description,
    instructions,
    formCues: formCues.length > 0 ? formCues : undefined,
    commonMistakes: commonMistakes.length > 0 ? commonMistakes : undefined,
    tips: tips.length > 0 ? tips : undefined,
    images,
    videos,
    gifs,
    defaultTempo: primary.defaultTempo,
    rangeOfMotionNotes: pickBest(exercises.map((ex) => ex.rangeOfMotionNotes)),
    intensityGuidelines,
    vbtData,
    sources: allSources,
    qualityScore: 0,
    popularityScore: Math.max(...exercises.map((ex) => ex.popularityScore)),
    createdAt: primary.createdAt,
    updatedAt: now,
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Score the richness of an exercise entry (how many fields are filled).
 */
function scoreRichness(ex: NormalizedExercise): number {
  let score = 0;
  if (ex.description) score += 10;
  if (ex.instructions && ex.instructions.length > 0) score += 10;
  if (ex.formCues && ex.formCues.length > 0) score += 8;
  if (ex.muscleGroups.length > 0) score += 5;
  if (ex.secondaryMuscleGroups.length > 0) score += 3;
  if (ex.equipment.length > 0) score += 3;
  if (ex.images.length > 0) score += 5;
  if (ex.gifs.length > 0) score += 5;
  if (ex.videos.length > 0) score += 5;
  if (ex.aliases.length > 0) score += 2;
  if (ex.vbtData) score += 10;
  if (ex.cableSetup) score += 3;
  return score;
}

/**
 * Pick the best (longest non-empty) string from an array of candidates.
 */
function pickBest(candidates: (string | undefined)[]): string | undefined {
  return candidates
    .filter((c): c is string => c != null && c.length > 0)
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Pick the best (longest) array from an array of candidates.
 */
function pickBestArray(candidates: (string[] | undefined)[]): string[] | undefined {
  return candidates
    .filter((c): c is string[] => c != null && c.length > 0)
    .sort((a, b) => b.length - a.length)[0];
}
