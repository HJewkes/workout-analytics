# Exercises catalog

Source: `src/exercises/`. A normalized exercise catalog with muscle-group / movement-pattern / equipment indexes and runtime data injection.

## Table of contents

- [Type vocabulary](#type-vocabulary)
- [`Exercise` shape](#exercise-shape)
- [Catalog injection](#catalog-injection)
- [Lookup functions](#lookup-functions)
- [Data file](#data-file)
- [Pipeline scripts](#pipeline-scripts)

## Type vocabulary

Source: `src/exercises/types.ts`.

### `MuscleGroupId` (18 values)

`'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'forearms' | 'traps' | 'lats' | 'abs' | 'obliques' | 'adductors' | 'abductors' | 'neck'`

### `MovementPatternId` (8 values)

`'push' | 'pull' | 'hinge' | 'squat' | 'lunge' | 'carry' | 'rotation' | 'isolation'`

### `EquipmentCategory` (8 values)

`'cable' | 'barbell' | 'dumbbell' | 'machine' | 'bodyweight' | 'band' | 'kettlebell' | 'other'`

### `EquipmentInfo`

```ts
{ name: string; category: EquipmentCategory }
```

### `CableSetup`

```ts
{
  cablePath: 'high' | 'mid' | 'low' | 'floor' | 'multiple';
  attachments: string[];
  notes?: string;
  originalEquipment?: string;  // e.g. the barbell variant this cable setup substitutes for
}
```

## `Exercise` shape

Definition: `src/exercises/types.ts`.

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Unique slug identifier. |
| `name` | `string` | Display name. |
| `aliases` | `string[]?` | Alternative names (search-matched). |
| `muscleGroups` | `MuscleGroupId[]` | Primary. |
| `secondaryMuscleGroups` | `MuscleGroupId[]?` | Secondary. |
| `movementPattern` | `MovementPatternId` | |
| `exerciseType` | `'compound' \| 'isolation'` | |
| `equipment` | `EquipmentInfo[]` | All equipment options. |
| `cableEquivalent` | `boolean` | Whether this can be performed with cables. |
| `cableSetup` | `CableSetup?` | Setup details when `cableEquivalent: true`. |
| `description` | `string?` | |
| `instructions` | `string[]?` | Step-by-step. |
| `formCues` | `string[]?` | |
| `commonMistakes` | `string[]?` | |
| `tips` | `string[]?` | |
| `qualityScore` | `number` | Data completeness (0-100+). |

## Catalog injection

The catalog is decoupled from any specific data source. Source: `src/exercises/catalog.ts`.

### `setCatalog(exercises)`

Pass an `Exercise[]` from any source — JSON import, fetched API response, embedded fixture. Resets and rebuilds the four indexes.

### `loadCatalog()`

Async dynamic import of `./data/catalog.json`. Returns the count of exercises loaded. If the file does not exist (catalog not yet generated), sets an empty catalog and returns 0 — does not throw.

### Indexes

Internally maintained:

- `byId: Map<string, Exercise>`
- `byMuscleGroup: Map<MuscleGroupId, Exercise[]>`
- `byMovementPattern: Map<MovementPatternId, Exercise[]>`
- `byEquipmentCategory: Map<EquipmentCategory, Exercise[]>`

`buildIndexes()` is idempotent and called lazily on every lookup.

## Lookup functions

Source: `src/exercises/catalog.ts`. Re-exported via `src/exercises/index.ts` and `src/index.ts`.

| Function | Returns | Notes |
| --- | --- | --- |
| `getExerciseById(id)` | `Exercise \| undefined` | |
| `getAllExercises()` | `Exercise[]` | |
| `getExercisesByMuscleGroup(muscleGroup)` | `Exercise[]` | |
| `getExercisesByMovementPattern(pattern)` | `Exercise[]` | |
| `getExercisesByEquipment(category)` | `Exercise[]` | |
| `getCableExercises()` | `Exercise[]` | filters `cableEquivalent === true`. |
| `searchExercises(query)` | `Exercise[]` | case-insensitive substring on `name` and `aliases`. |
| `hasExercise(id)` | `boolean` | |
| `getExerciseCount()` | `number` | note: does NOT call `buildIndexes()`. |

All lookups call `buildIndexes()` first, so they work without an explicit setup call (returning empty results until `setCatalog` / `loadCatalog` runs).

## Data file

`src/exercises/data/catalog.json` — generated catalog. Loaded via dynamic import so consumers that ship this package as an ESM dependency pull it in lazily. Listed under `files: ["dist"]` in `package.json:33-35`, so it ships in the published package once the build copies it (see `tsc-alias` in the build script).

If a consumer has different data needs, they can call `setCatalog(myCustomExercises)` instead of `loadCatalog()` and never touch the bundled JSON.

## Pipeline scripts

The catalog data is produced by an offline pipeline under `scripts/`. NPM scripts (`package.json:46-52`):

| Script | Purpose |
| --- | --- |
| `exercises:analyze` | Initial pass over source data. |
| `exercises:collect` | Fetch / scrape data. |
| `exercises:process` | Normalize into `Exercise` shape. |
| `exercises:export` | Emit `src/exercises/data/catalog.json`. |
| `exercises:research` | Enrichment via `scripts/research/exercise-enrichment.ts`. |
| `exercises:pipeline` | analyze → collect → process → export in sequence. |

These scripts are dev-time only — not part of the runtime surface. The package consumes the resulting JSON via `loadCatalog()`.
