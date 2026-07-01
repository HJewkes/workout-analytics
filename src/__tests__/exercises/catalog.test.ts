/**
 * Exercise Catalog Tests
 *
 * Covers catalog loading and the data-driven lookup helpers exposed
 * through the public API (src/index.ts -> src/exercises).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  type Exercise,
  setCatalog,
  loadCatalog,
  getExerciseById,
  getAllExercises,
  getExercisesByMuscleGroup,
  getExercisesByMovementPattern,
  getExercisesByEquipment,
  getCableExercises,
  searchExercises,
  hasExercise,
  getExerciseCount,
} from '@/index';

// =============================================================================
// Fixtures
// =============================================================================

const benchPress: Exercise = {
  id: 'bench-press',
  name: 'Bench Press',
  aliases: ['Chest Press'],
  muscleGroups: ['chest', 'triceps'],
  movementPattern: 'push',
  exerciseType: 'compound',
  equipment: [{ name: 'Barbell', category: 'barbell' }],
  cableEquivalent: true,
  qualityScore: 80,
};

const bicepCurl: Exercise = {
  id: 'bicep-curl',
  name: 'Bicep Curl',
  muscleGroups: ['biceps'],
  movementPattern: 'isolation',
  exerciseType: 'isolation',
  equipment: [{ name: 'Dumbbell', category: 'dumbbell' }],
  cableEquivalent: false,
  qualityScore: 60,
};

const backSquat: Exercise = {
  id: 'back-squat',
  name: 'Back Squat',
  aliases: ['Barbell Squat'],
  muscleGroups: ['quads', 'glutes'],
  movementPattern: 'squat',
  exerciseType: 'compound',
  equipment: [
    { name: 'Barbell', category: 'barbell' },
    { name: 'Rack', category: 'other' },
  ],
  cableEquivalent: false,
  qualityScore: 90,
};

const fixtures: Exercise[] = [benchPress, bicepCurl, backSquat];

// =============================================================================
// loadCatalog()
// =============================================================================

describe('loadCatalog()', () => {
  it('loads the generated catalog data file and returns the exercise count', async () => {
    const count = await loadCatalog();

    // The checked-in generated catalog.json is currently an empty array
    // (not yet populated by the collection pipeline). loadCatalog() should
    // resolve cleanly with 0 rather than throwing.
    expect(count).toBe(0);
    expect(getExerciseCount()).toBe(0);
    expect(getAllExercises()).toEqual([]);
  });
});

// =============================================================================
// Lookup Helpers (data-driven via setCatalog fixtures)
// =============================================================================

describe('catalog lookup helpers', () => {
  beforeEach(() => {
    setCatalog(fixtures);
  });

  describe('getExerciseById()', () => {
    it('returns the matching exercise', () => {
      expect(getExerciseById('bench-press')).toEqual(benchPress);
    });

    it('returns undefined for an unknown id', () => {
      expect(getExerciseById('does-not-exist')).toBeUndefined();
    });
  });

  describe('getAllExercises()', () => {
    it('returns every exercise in the catalog', () => {
      expect(getAllExercises()).toEqual(fixtures);
    });
  });

  describe('getExercisesByMuscleGroup()', () => {
    it('returns exercises targeting the given muscle group', () => {
      expect(getExercisesByMuscleGroup('chest')).toEqual([benchPress]);
    });

    it('returns an empty array when no exercise targets the muscle group', () => {
      expect(getExercisesByMuscleGroup('calves')).toEqual([]);
    });
  });

  describe('getExercisesByMovementPattern()', () => {
    it('returns exercises matching the movement pattern', () => {
      expect(getExercisesByMovementPattern('squat')).toEqual([backSquat]);
    });

    it('returns an empty array when no exercise matches the pattern', () => {
      expect(getExercisesByMovementPattern('carry')).toEqual([]);
    });
  });

  describe('getExercisesByEquipment()', () => {
    it('returns exercises using the given equipment category', () => {
      expect(getExercisesByEquipment('barbell')).toEqual([benchPress, backSquat]);
    });

    it('returns an empty array when no exercise uses the equipment category', () => {
      expect(getExercisesByEquipment('band')).toEqual([]);
    });
  });

  describe('getCableExercises()', () => {
    it('returns only cable-compatible exercises', () => {
      expect(getCableExercises()).toEqual([benchPress]);
    });
  });

  describe('searchExercises()', () => {
    it('matches case-insensitively by name substring', () => {
      expect(searchExercises('squat')).toEqual([backSquat]);
      expect(searchExercises('BENCH')).toEqual([benchPress]);
    });

    it('matches case-insensitively by alias substring', () => {
      expect(searchExercises('chest press')).toEqual([benchPress]);
    });

    it('returns an empty array when nothing matches', () => {
      expect(searchExercises('deadlift')).toEqual([]);
    });
  });

  describe('hasExercise()', () => {
    it('returns true for a known id', () => {
      expect(hasExercise('bicep-curl')).toBe(true);
    });

    it('returns false for an unknown id', () => {
      expect(hasExercise('does-not-exist')).toBe(false);
    });
  });

  describe('getExerciseCount()', () => {
    it('returns the number of exercises in the catalog', () => {
      expect(getExerciseCount()).toBe(fixtures.length);
    });
  });
});
