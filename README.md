# @voltras/workout-analytics

A hardware-agnostic TypeScript library for analyzing workout telemetry data. Process real-time exercise samples into structured reps and sets with automatic boundary detection and O(1) metric access.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Breaking changes (1.0.0)

`@voltras/workout-analytics` is now **ESM-only**. The dual CJS/ESM build has been dropped.

- `package.json#type` is `"module"`; only `dist/esm/` and `dist/types/` ship.
- Consumers on ESM (Node 20+ with `"type": "module"`, modern bundlers, or React Native + Metro): no action required.
- Consumers on CJS: either migrate the consumer to ESM or use a dynamic import:
  ```js
  const wa = await import('@voltras/workout-analytics');
  ```

## Subpath exports

| Subpath | Purpose | Peer |
| --- | --- | --- |
| `@voltras/workout-analytics` | Existing analytics surface (reps, sets, VBT). | — |
| `@voltras/workout-analytics/schema` | Schema record types and zod validators. | — |
| `@voltras/workout-analytics/store` | `SessionStore` interface, error classes, transaction shim. | — |
| `@voltras/workout-analytics/store/sqlite-node` | Node SQLite driver. | `better-sqlite3@^11` |
| `@voltras/workout-analytics/store/sqlite-expo` | Expo / React Native SQLite driver. | `expo-sqlite@^15` |

The SQLite drivers are declared as **optional peer dependencies**. Install only the driver you need:

```bash
npm install @voltras/workout-analytics better-sqlite3   # Node target
npm install @voltras/workout-analytics expo-sqlite      # Expo / React Native target
```

### Node usage

```ts
import { createSqliteNodeStore } from '@voltras/workout-analytics/store/sqlite-node';

const store = await createSqliteNodeStore({ path: './app.sqlite' });
await store.saveSession({ id: 's1', startedAt: Date.now(), schemaVersion: 1 });
```

### Expo / React Native usage

```ts
import { createSqliteExpoStore } from '@voltras/workout-analytics/store/sqlite-expo';

// `path` is passed through to expo-sqlite's openDatabaseAsync — accepts a
// database file name, an absolute path, or `:memory:`.
const store = await createSqliteExpoStore({ path: 'app.sqlite' });
await store.saveSession({ id: 's1', startedAt: Date.now(), schemaVersion: 1 });
```

### Verification

The Expo driver is verified via type resolution at build time (TypeScript resolves types from `expo-sqlite/package.json#exports`) and via integration tests in `voltras/mobile`. The package's own CI does not run a runtime spike against the Expo driver: `expo-sqlite` is a React Native native module and cannot import in plain Node, so the conformance suite (`runStoreTests`) skips at runtime when the native module is unavailable. Functional verification on devices and simulators is owned by `voltras/mobile`.

## Features

- **Real-time Processing**: Stream `WorkoutSample` data and get automatic rep/set boundaries
- **O(1) Metrics**: Running aggregates computed incrementally - no re-scanning
- **Immutable Data Structures**: All operations return new objects, safe to share
- **Hardware Agnostic**: Works with any telemetry source that provides `WorkoutSample` data
- **TypeScript**: Full type definitions included

## Installation

```bash
npm install @voltras/workout-analytics
```

## Quick Start

```typescript
import {
  MovementPhase,
  createSet,
  addSampleToSet,
  completeSet,
  getRepMeanVelocity,
  getRepTempo,
} from '@voltras/workout-analytics';

// Create a new set
let set = createSet();

// Process samples as they arrive from your device
for (const sample of telemetryStream) {
  set = addSampleToSet(set, sample);
}

// Finalize when done (trims trailing idle time)
set = completeSet(set);

// Access metrics
for (const rep of set.reps) {
  console.log(`Rep ${rep.repNumber}: ${getRepMeanVelocity(rep).toFixed(2)} m/s, tempo ${getRepTempo(rep)}`);
}
```

## Core Concepts

### WorkoutSample

The fundamental telemetry data point. Adapters convert device-specific data into this format.

```typescript
interface WorkoutSample {
  sequence: number;      // Incrementing sequence (for drop detection)
  timestamp: number;     // Timestamp in ms since epoch
  phase: MovementPhase;  // IDLE, CONCENTRIC, HOLD, or ECCENTRIC
  position: number;      // Position in ROM (0 = start, 1 = full extension)
  velocity: number;      // Instantaneous velocity (m/s, always positive)
  force: number;         // Force reading (lbs, absolute value)
}
```

### Movement Phases

```typescript
enum MovementPhase {
  IDLE = 0,       // Ready / resting
  CONCENTRIC = 1, // Lifting phase (muscle shortening)
  HOLD = 2,       // Isometric hold at top of rep
  ECCENTRIC = 3,  // Lowering phase (muscle lengthening)
}
```

### Data Hierarchy

```
Set
└── Rep[]
    ├── concentric: Phase  (lifting + hold at top)
    └── eccentric: Phase   (lowering + hold at bottom)
        └── samples: WorkoutSample[]
```

**Rep boundaries** are detected automatically: a new rep starts when transitioning from eccentric → concentric.

## API Reference

### Set Functions

| Function | Description |
|----------|-------------|
| `createSet()` | Create an empty set |
| `addSampleToSet(set, sample)` | Add a sample, returns new set with automatic rep detection |
| `completeSet(set)` | Finalize set, trims trailing idle from last rep |
| `getSetRepCount(set)` | Number of reps |
| `getSetDuration(set)` | Total duration in seconds |
| `getSetTimeUnderTension(set)` | Movement time excluding holds |

### Rep Functions

| Function | Description |
|----------|-------------|
| `createRep(repNumber)` | Create a new rep (usually handled by Set) |
| `addSampleToRep(rep, sample)` | Add a sample, routes to appropriate phase |
| `getRepDuration(rep)` | Total rep duration in seconds |
| `getRepTempo(rep)` | Tempo string (e.g., "3-1-2-0") |
| `getRepMeanVelocity(rep)` | Mean concentric velocity (m/s) |
| `getRepPeakVelocity(rep)` | Peak concentric velocity (m/s) |
| `getRepPeakForce(rep)` | Peak force across both phases |
| `getRepRangeOfMotion(rep)` | ROM as position value (0-1) |
| `getRepSamples(rep)` | All samples in the rep |

### Phase Functions

| Function | Description |
|----------|-------------|
| `addSampleToPhase(phase, sample)` | Add a sample to phase |
| `rebuildPhaseFromSamples(samples)` | Reconstruct phase from samples |
| `getPhaseDuration(phase)` | Total duration in seconds |
| `getPhaseHoldDuration(phase)` | Hold/pause time in seconds |
| `getPhaseMovementDuration(phase)` | Movement time (excluding holds) |
| `getPhaseMeanVelocity(phase)` | Mean velocity during movement |
| `getPhaseMeanForce(phase)` | Mean force during movement |
| `getPhaseRangeOfMotion(phase)` | Absolute position change |

### Tempo

```typescript
import { formatTempo, parseTempo } from '@voltras/workout-analytics';

// Format parts into standard tempo notation
formatTempo({ eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 }); // "3-1-2-0"

// Parse tempo string into parts
parseTempo("3-1-2-0"); // { eccentric: 3, pauseBottom: 1, concentric: 2, pauseTop: 0 }
```

## Repository Structure

### `src/` - Public SDK

The main library with immutable data structures and O(1) metric access:

```
src/
├── models/
│   ├── types.ts      # MovementPhase enum, PhaseNames
│   ├── sample.ts     # WorkoutSample interface
│   ├── phase.ts      # Phase type and functions
│   ├── rep.ts        # Rep type and functions
│   ├── set.ts        # Set type and functions
│   └── tempo.ts      # Tempo formatting/parsing
└── index.ts          # Public exports
```

### `v0/` - Reference Implementation

Contains analytics code extracted from the Voltras mobile app. Serves as reference for:

- Rep detection algorithms
- VBT (velocity-based training) utilities
- RPE/RIR estimation
- Load-velocity profiling
- Fatigue assessment

This code is being incrementally migrated and refined into `src/`.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## License

MIT License - see [LICENSE](LICENSE) for details.
