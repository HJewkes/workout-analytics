# @voltras/workout-analytics

A hardware-agnostic TypeScript library for analyzing workout telemetry data, estimating effort (RPE/RIR), calculating strength metrics (1RM), building velocity profiles, and assessing fatigue. Designed for workout intensity assessment, intra-workout autoregulation, and overall programming.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Rep & Set Analysis**: Detect rep boundaries, aggregate phase metrics, compute set-level statistics
- **Effort Estimation**: Estimate RPE (Rate of Perceived Exertion) and RIR (Reps In Reserve) from velocity data
- **Strength Metrics**: Calculate 1RM estimates using Epley formula and velocity-based methods
- **Velocity Profiles**: Build load-velocity profiles for personalized training zones
- **Fatigue Assessment**: Track velocity loss, eccentric control, and form degradation
- **Hardware Agnostic**: Works with any telemetry source that provides `WorkoutSample` data
- **TypeScript**: Full type definitions included

## Repository Structure

This repository is organized into two main directories:

### `src/` (Future Public API)

The `src/` directory is currently empty and reserved for the future public API implementation. This will be a carefully designed, clean API that:

- Provides a hardware-agnostic interface
- Uses `WorkoutSample` as the primary telemetry format
- Focuses on pure functions and clear separation of concerns
- Follows domain-driven design principles

### `v0/` (Reference Implementation)

The `v0/` directory contains a complete copy of the workout analytics code extracted from the `voltras` mobile application. This serves as:

- **Reference**: A working implementation to reference during migration
- **Documentation**: Examples of how metrics are calculated and how detectors work
- **Testing**: Test files that validate the expected behavior

The `v0/` structure mirrors the domain organization:

```
v0/
├── models/          # Core data structures (WorkoutSample, Rep, Set, etc.)
├── aggregators/     # Metric computation functions (phase, rep, set level)
├── detectors/       # Event detection (rep boundaries from samples)
├── analytics/       # High-level analysis (strength, readiness, fatigue estimates)
├── vbt/            # Velocity-based training utilities (profiles, 1RM, zones)
└── __tests__/      # Test files for all modules
```

**Note**: Code in `v0/` may contain:
- Voltra-specific imports (e.g., `@/domain/workout`)
- Dependencies on the original app's architecture
- Patterns that will be refined in the `src/` implementation

## Migration Plan

The migration from `v0/` to `src/` will be gradual and deliberate:

1. **Design Phase**: Define the public API structure and interfaces
2. **Incremental Migration**: Port modules one at a time, adapting as needed
3. **Testing**: Ensure migrated code maintains compatibility with `v0/` test expectations
4. **Documentation**: Add comprehensive documentation for the public API

## Installation

```bash
npm install @voltras/workout-analytics
```

## Usage

> **Note**: The public API is still under development. The examples below represent the intended API design.

### Basic Rep Detection

```typescript
import { RepDetector } from '@voltras/workout-analytics';

const detector = new RepDetector();

// Process telemetry samples
for (const sample of telemetryStream) {
  const repBoundary = detector.processSample(sample);
  
  if (repBoundary) {
    console.log(`Rep ${repBoundary.repNumber} completed`);
  }
}
```

### Set Metrics Calculation

```typescript
import { aggregateSet } from '@voltras/workout-analytics';

// After detecting reps and aggregating phases
const setMetrics = aggregateSet(reps, plannedSet);

console.log(`RIR: ${setMetrics.effort.rir}`);
console.log(`RPE: ${setMetrics.effort.rpe}`);
console.log(`Fatigue Index: ${setMetrics.fatigue.fatigueIndex}`);
```

### Velocity-Based Training

```typescript
import { buildLoadVelocityProfile, generateWorkingWeightRecommendation } from '@voltras/workout-analytics';

// Build profile from historical data
const profile = buildLoadVelocityProfile('bench-press', [
  { weight: 135, velocity: 0.65 },
  { weight: 155, velocity: 0.50 },
  { weight: 175, velocity: 0.35 },
]);

// Generate training recommendations
const recommendation = generateWorkingWeightRecommendation(
  profile,
  TrainingGoal.HYPERTROPHY
);

console.log(`Recommended weight: ${recommendation.workingWeight} lbs`);
console.log(`Rep range: ${recommendation.repRange[0]}-${recommendation.repRange[1]}`);
```

## Core Concepts

### WorkoutSample

The fundamental telemetry data structure. A `WorkoutSample` contains:

- `timestamp`: When the sample was recorded
- `phase`: Movement phase (concentric, eccentric, hold, idle)
- `position`: Normalized position (0-1)
- `velocity`: Movement velocity (m/s)
- `force`: Applied force (N)

### Rep Detection

The `RepDetector` uses a state machine to identify rep boundaries from a stream of `WorkoutSample` data. It tracks:

- Movement phases (concentric → hold → eccentric)
- Rep completion (when eccentric phase ends)
- Abandoned reps (concentric without eccentric)

### Metric Aggregation

Metrics are computed at three levels:

1. **Phase Level**: Duration, velocity, force from samples
2. **Rep Level**: Combined concentric/eccentric metrics, tempo
3. **Set Level**: Velocity decline, fatigue index, RPE/RIR estimation

### Velocity-Based Training (VBT)

VBT utilities help:

- Build load-velocity profiles from training data
- Estimate 1RM from velocity measurements
- Generate working weight recommendations based on training goals
- Suggest warmup sets

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run type-check
```

## Contributing

This repository is currently in active development. The `v0/` implementation serves as a reference, and the `src/` directory will contain the public API once migration is complete.

## License

MIT License - see [LICENSE](LICENSE) file for details.
