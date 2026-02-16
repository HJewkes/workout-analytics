/**
 * Cable Equivalence Analyzer
 *
 * Determines which exercises can be performed with a cable machine.
 * Maps exercises to cable setup requirements (pulley position, attachments).
 */

import type { ExerciseMetadata, CableSetup, EquipmentCategory } from '../../shared/types.js';
import { categorizeEquipment } from './equipment-analyzer.js';

// =============================================================================
// Cable Compatibility Rules
// =============================================================================

/**
 * Movement/body-part patterns that map to cable pulley positions.
 * Based on the direction of force needed.
 */
const BODY_PART_TO_CABLE_PATH: Record<string, CableSetup['cablePath']> = {
  // High cable (pulling down or pressing forward from above)
  'back': 'high',
  'lats': 'high',

  // Mid cable (horizontal movements)
  'chest': 'mid',
  'shoulders': 'mid',

  // Low cable (pulling up or curling)
  'lower legs': 'low',
  'upper legs': 'low',
  'waist': 'low',

  // Variable depending on specific exercise
  'upper arms': 'multiple',
  'lower arms': 'low',
  'neck': 'low',
  'cardio': 'mid',
};

/**
 * Exercise name keywords that indicate cable path.
 */
const NAME_TO_CABLE_PATH: Array<{ keywords: string[]; path: CableSetup['cablePath'] }> = [
  { keywords: ['pulldown', 'pull down', 'pull-down', 'lat pull'], path: 'high' },
  { keywords: ['face pull'], path: 'high' },
  { keywords: ['overhead extension', 'overhead tricep'], path: 'high' },
  { keywords: ['row', 'seated row', 'cable row'], path: 'mid' },
  { keywords: ['fly', 'flye', 'crossover', 'cross over'], path: 'mid' },
  { keywords: ['chest press', 'push'], path: 'mid' },
  { keywords: ['lateral raise', 'side raise'], path: 'low' },
  { keywords: ['curl', 'bicep'], path: 'low' },
  { keywords: ['pushdown', 'push down', 'push-down', 'tricep press'], path: 'high' },
  { keywords: ['kickback'], path: 'low' },
  { keywords: ['squat'], path: 'low' },
  { keywords: ['deadlift', 'hip thrust', 'pull through'], path: 'low' },
  { keywords: ['lunge'], path: 'low' },
  { keywords: ['crunch', 'ab'], path: 'high' },
  { keywords: ['woodchop', 'wood chop', 'rotation'], path: 'high' },
  { keywords: ['shoulder press', 'military press'], path: 'low' },
  { keywords: ['upright row'], path: 'low' },
  { keywords: ['shrug'], path: 'low' },
  { keywords: ['leg curl', 'hamstring curl'], path: 'low' },
  { keywords: ['leg extension'], path: 'low' },
];

/**
 * Equipment to cable attachment mappings.
 */
const EQUIPMENT_ATTACHMENTS: Record<EquipmentCategory, string[]> = {
  cable: ['handle', 'rope', 'bar', 'v-bar'],
  barbell: ['straight bar', 'ez-bar attachment'],
  dumbbell: ['single handle', 'D-handle'],
  machine: ['appropriate attachment'],
  bodyweight: ['ankle strap', 'belt', 'handle'],
  band: ['handle'],
  kettlebell: ['single handle', 'rope'],
  other: ['handle'],
};

/**
 * Exercise name keywords that suggest specific attachments.
 */
const NAME_TO_ATTACHMENT: Array<{ keywords: string[]; attachment: string }> = [
  { keywords: ['rope', 'hammer'], attachment: 'rope' },
  { keywords: ['bar', 'straight'], attachment: 'straight bar' },
  { keywords: ['v-bar', 'v bar'], attachment: 'v-bar' },
  { keywords: ['handle', 'single arm', 'one arm', 'unilateral'], attachment: 'D-handle' },
  { keywords: ['ankle', 'kickback', 'leg curl'], attachment: 'ankle strap' },
  { keywords: ['belt', 'hip thrust'], attachment: 'belt attachment' },
];

// =============================================================================
// Exercises That Are NOT Cable-Compatible
// =============================================================================

/**
 * Keywords that indicate exercises that cannot be effectively done with cables.
 */
const NON_CABLE_KEYWORDS = [
  'run', 'jog', 'sprint', 'walk',
  'bike', 'cycle', 'cycling',
  'swim', 'swimming',
  'jump', 'box jump', 'plyometric',
  'stretch', 'yoga', 'pilates',
  'foam roll', 'roller',
  'burpee', 'mountain climber',
  'handstand', 'muscle up', 'muscle-up',
  'plank', 'push up', 'push-up', 'pushup',
  'pull up', 'pull-up', 'pullup', 'chin up', 'chin-up',
  'dip', 'sit up', 'sit-up',
  'elliptical', 'treadmill', 'stepper',
];

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Determine if an exercise can be done with cables.
 */
export function isCableCompatible(exercise: ExerciseMetadata): boolean {
  if (!exercise.name) return false;
  const name = exercise.name.toLowerCase();

  // Direct cable exercise
  const equipmentCategories = (exercise.equipment ?? []).map((e) => categorizeEquipment(e));
  if (equipmentCategories.includes('cable')) return true;

  // Check for non-cable exercises
  if (NON_CABLE_KEYWORDS.some((kw) => name.includes(kw))) return false;

  // Body-part based exercises with cardio category are not cable-compatible
  if (exercise.category?.toLowerCase() === 'cardio') return false;

  // Check equipment compatibility
  const hasCompatibleEquipment = equipmentCategories.some(
    (cat) => cat === 'barbell' || cat === 'dumbbell' || cat === 'machine' || cat === 'band' || cat === 'kettlebell',
  );

  // No equipment = likely bodyweight, some are cable-adaptable
  const noEquipment = exercise.equipment.length === 0;
  if (noEquipment) {
    // Bodyweight exercises that can be cable-assisted
    const cableAdaptableBodyweight = [
      'row', 'curl', 'press', 'fly', 'raise', 'extension',
      'crunch', 'woodchop', 'pulldown', 'pushdown',
    ];
    return cableAdaptableBodyweight.some((kw) => name.includes(kw));
  }

  return hasCompatibleEquipment;
}

/**
 * Determine the cable setup for an exercise.
 */
export function getCableSetup(exercise: ExerciseMetadata): CableSetup | undefined {
  if (!isCableCompatible(exercise)) return undefined;
  if (!exercise.name) return undefined;

  const name = exercise.name.toLowerCase();
  const equipmentCategories = (exercise.equipment ?? []).map((e) => categorizeEquipment(e));

  // Determine cable path
  let cablePath = determineCablePath(name, exercise.bodyPart);

  // Determine attachments
  const attachments = determineAttachments(name, equipmentCategories);

  // Original equipment
  const originalEquipment = exercise.equipment.length > 0
    ? exercise.equipment.join(', ')
    : undefined;

  // Generate setup notes
  const notes = generateSetupNotes(name, cablePath, attachments, originalEquipment);

  return {
    cablePath,
    attachments,
    notes,
    originalEquipment,
  };
}

function determineCablePath(
  name: string,
  bodyPart?: string,
): CableSetup['cablePath'] {
  // Check name-based rules first (more specific)
  for (const rule of NAME_TO_CABLE_PATH) {
    if (rule.keywords.some((kw) => name.includes(kw))) {
      return rule.path;
    }
  }

  // Fall back to body-part mapping
  if (bodyPart) {
    const normalizedBodyPart = bodyPart.toLowerCase();
    if (normalizedBodyPart in BODY_PART_TO_CABLE_PATH) {
      return BODY_PART_TO_CABLE_PATH[normalizedBodyPart];
    }
  }

  return 'mid';
}

function determineAttachments(
  name: string,
  equipmentCategories: EquipmentCategory[],
): string[] {
  const attachments: string[] = [];

  // Check name-based attachment rules
  for (const rule of NAME_TO_ATTACHMENT) {
    if (rule.keywords.some((kw) => name.includes(kw))) {
      attachments.push(rule.attachment);
    }
  }

  // If no name-based match, use equipment category defaults
  if (attachments.length === 0) {
    for (const cat of equipmentCategories) {
      const defaults = EQUIPMENT_ATTACHMENTS[cat];
      if (defaults && defaults.length > 0) {
        attachments.push(defaults[0]);
        break;
      }
    }
  }

  // Default to handle if nothing else
  if (attachments.length === 0) {
    attachments.push('handle');
  }

  return [...new Set(attachments)];
}

function generateSetupNotes(
  name: string,
  cablePath: CableSetup['cablePath'],
  attachments: string[],
  originalEquipment?: string,
): string {
  const parts: string[] = [];

  const pathDescriptions: Record<string, string> = {
    high: 'Set cable to highest position',
    mid: 'Set cable to chest/shoulder height',
    low: 'Set cable to lowest position',
    floor: 'Set cable at floor level',
    multiple: 'Adjust cable height as needed for the movement',
  };

  parts.push(pathDescriptions[cablePath] ?? 'Adjust cable height');

  if (attachments.length > 0) {
    parts.push(`Attach: ${attachments.join(' or ')}`);
  }

  if (originalEquipment && !originalEquipment.toLowerCase().includes('cable')) {
    parts.push(`Replaces: ${originalEquipment}`);
  }

  return parts.join('. ') + '.';
}

// =============================================================================
// Batch Analysis
// =============================================================================

/**
 * Analyze cable compatibility for all exercises.
 */
export function analyzeCableEquivalence(exercises: ExerciseMetadata[]): {
  compatible: Array<{ exercise: ExerciseMetadata; setup: CableSetup }>;
  incompatible: ExerciseMetadata[];
  stats: {
    total: number;
    compatible: number;
    incompatible: number;
    directCable: number;
    adaptable: number;
  };
} {
  const compatible: Array<{ exercise: ExerciseMetadata; setup: CableSetup }> = [];
  const incompatible: ExerciseMetadata[] = [];
  let directCable = 0;

  for (const exercise of exercises) {
    if (isCableCompatible(exercise)) {
      const setup = getCableSetup(exercise);
      if (setup) {
        compatible.push({ exercise, setup });
        if (exercise.equipment.some((e) => categorizeEquipment(e) === 'cable')) {
          directCable++;
        }
      }
    } else {
      incompatible.push(exercise);
    }
  }

  return {
    compatible,
    incompatible,
    stats: {
      total: exercises.length,
      compatible: compatible.length,
      incompatible: incompatible.length,
      directCable,
      adaptable: compatible.length - directCable,
    },
  };
}
