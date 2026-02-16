/**
 * Equipment Analyzer
 *
 * Analyzes equipment distribution across collected exercise metadata.
 * Maps raw equipment strings to normalized categories and identifies
 * cable-equivalent equipment.
 */

import type {
  ExerciseMetadata,
  EquipmentDistribution,
  EquipmentCategory,
} from '../../shared/types.js';
import { countBy, sortByDescending } from '../../shared/utils.js';

// =============================================================================
// Equipment Normalization Map
// =============================================================================

/**
 * Maps raw equipment strings (from various APIs) to normalized categories.
 * Keys are lowercase for case-insensitive matching.
 */
const EQUIPMENT_CATEGORY_MAP: Record<string, EquipmentCategory> = {
  // Cable equipment
  cable: 'cable',
  'cable machine': 'cable',
  cables: 'cable',
  'cable crossover': 'cable',
  'cable station': 'cable',
  'pulley': 'cable',

  // Barbell
  barbell: 'barbell',
  'ez barbell': 'barbell',
  'ez-bar': 'barbell',
  'olympic barbell': 'barbell',
  'trap bar': 'barbell',
  'smith machine': 'barbell',

  // Dumbbell
  dumbbell: 'dumbbell',
  dumbbells: 'dumbbell',

  // Machine
  machine: 'machine',
  'leverage machine': 'machine',
  'sled machine': 'machine',
  'leg press': 'machine',
  'hack squat': 'machine',

  // Bodyweight
  'body weight': 'bodyweight',
  bodyweight: 'bodyweight',
  'assisted': 'bodyweight',

  // Band
  band: 'band',
  'resistance band': 'band',
  bands: 'band',

  // Kettlebell
  kettlebell: 'kettlebell',

  // Other
  'medicine ball': 'other',
  'stability ball': 'other',
  'bosu ball': 'other',
  'foam roller': 'other',
  'roller': 'other',
  'weighted': 'other',
  'rope': 'cable',
  'tire': 'other',
  'wheel roller': 'other',
  'upper body ergometer': 'other',
  'elliptical machine': 'other',
  'skierg machine': 'other',
  'stepmill machine': 'other',
  'stationary bike': 'other',
};

/**
 * Equipment that can be approximated or replaced by cables.
 */
const CABLE_EQUIVALENT_EQUIPMENT: Set<string> = new Set([
  'cable',
  'barbell',
  'dumbbell',
  'machine',
  'band',
  'kettlebell',
  'bodyweight',
]);

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Categorize a raw equipment string into an EquipmentCategory.
 */
export function categorizeEquipment(rawEquipment: string): EquipmentCategory {
  const normalized = rawEquipment.toLowerCase().trim();
  return EQUIPMENT_CATEGORY_MAP[normalized] ?? 'other';
}

/**
 * Check if an equipment category can be approximated with cables.
 */
export function isCableEquivalent(category: EquipmentCategory): boolean {
  return CABLE_EQUIVALENT_EQUIPMENT.has(category);
}

/**
 * Analyze equipment distribution across exercise metadata.
 */
export function analyzeEquipmentDistribution(
  exercises: ExerciseMetadata[],
): EquipmentDistribution[] {
  // Flatten all equipment strings
  const allEquipment = exercises.flatMap((ex) => ex.equipment);
  const total = allEquipment.length;

  // Count by raw equipment name
  const rawCounts = countBy(allEquipment, (e) => e.toLowerCase().trim());

  // Build distribution
  const distribution: EquipmentDistribution[] = Object.entries(rawCounts)
    .map(([equipment, count]) => {
      const category = categorizeEquipment(equipment);
      return {
        equipment,
        category,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0,
        cableEquivalent: isCableEquivalent(category),
      };
    });

  return sortByDescending(distribution, (d) => d.count);
}

/**
 * Get equipment distribution grouped by category.
 */
export function getEquipmentByCategory(
  distribution: EquipmentDistribution[],
): Record<EquipmentCategory, { count: number; percentage: number; items: string[] }> {
  const categories: Record<string, { count: number; items: string[] }> = {};

  const totalExercises = distribution.reduce((sum, d) => sum + d.count, 0);

  for (const d of distribution) {
    if (!categories[d.category]) {
      categories[d.category] = { count: 0, items: [] };
    }
    categories[d.category].count += d.count;
    categories[d.category].items.push(d.equipment);
  }

  const result: Record<string, { count: number; percentage: number; items: string[] }> = {};
  for (const [cat, data] of Object.entries(categories)) {
    result[cat] = {
      ...data,
      percentage: totalExercises > 0 ? (data.count / totalExercises) * 100 : 0,
    };
  }

  return result as Record<EquipmentCategory, { count: number; percentage: number; items: string[] }>;
}

/**
 * Count how many exercises can be done with cables (directly or as equivalent).
 */
export function countCableCompatibleExercises(exercises: ExerciseMetadata[]): {
  directCable: number;
  cableEquivalent: number;
  notCableCompatible: number;
  total: number;
} {
  let directCable = 0;
  let cableEquivalent = 0;
  let notCableCompatible = 0;

  for (const ex of exercises) {
    const categories = ex.equipment.map((e) => categorizeEquipment(e));

    if (categories.includes('cable')) {
      directCable++;
    } else if (categories.some((c) => isCableEquivalent(c))) {
      cableEquivalent++;
    } else if (categories.length === 0) {
      // No equipment listed — likely bodyweight, potentially cable-compatible
      cableEquivalent++;
    } else {
      notCableCompatible++;
    }
  }

  return {
    directCable,
    cableEquivalent,
    notCableCompatible,
    total: exercises.length,
  };
}

/**
 * Get all unique equipment strings found across exercises.
 */
export function getUniqueEquipment(exercises: ExerciseMetadata[]): string[] {
  const equipmentSet = new Set<string>();
  for (const ex of exercises) {
    for (const eq of ex.equipment) {
      equipmentSet.add(eq.toLowerCase().trim());
    }
  }
  return [...equipmentSet].sort();
}
