/**
 * v0 Implementation
 *
 * This directory contains higher-level workout management code that builds
 * on the core src/models. Includes:
 * - Session/plan management (v0-specific)
 * - Analytics (velocity baselines, readiness, fatigue, strength estimation)
 * - VBT (velocity-based training profiles and constants)
 * - Detectors (rep boundary detection state machine)
 */

// Models (re-exports src models + v0-specific session/plan/stats)
export * from './models';

// Detectors
export * from './detectors';

// Analytics
export * from './analytics';

// VBT
export * from './vbt';
