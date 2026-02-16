/**
 * Base Collector
 *
 * Abstract interface and shared logic for exercise data collectors.
 * Each source (ExerciseDB, WGER, etc.) implements this interface.
 */

import type { ExerciseMetadata, NormalizedExercise, SourceId } from '../../shared/types.js';
import { log, sleep } from '../../shared/utils.js';

// =============================================================================
// Collector Interface
// =============================================================================

export interface CollectorConfig {
  /** Base URL for the API */
  baseUrl: string;
  /** Request headers (e.g., API keys) */
  headers?: Record<string, string>;
  /** Delay between requests in ms */
  rateLimit: number;
  /** Maximum number of exercises to collect (0 = all) */
  maxExercises: number;
  /** Specific exercise IDs to collect (empty = all) */
  targetIds?: string[];
}

export interface CollectorResult {
  source: SourceId;
  exercises: NormalizedExercise[];
  errors: CollectorError[];
  stats: CollectorStats;
}

export interface CollectorError {
  exerciseId?: string;
  message: string;
  timestamp: string;
}

export interface CollectorStats {
  source: SourceId;
  totalRequested: number;
  totalCollected: number;
  totalErrors: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

// =============================================================================
// Base Collector Class
// =============================================================================

export abstract class BaseCollector {
  protected config: CollectorConfig;
  protected errors: CollectorError[] = [];

  constructor(config: Partial<CollectorConfig> & { baseUrl: string }) {
    this.config = {
      baseUrl: config.baseUrl,
      headers: config.headers ?? {},
      rateLimit: config.rateLimit ?? 100,
      maxExercises: config.maxExercises ?? 0,
      targetIds: config.targetIds,
    };
  }

  abstract get sourceId(): SourceId;

  /**
   * Collect all exercises from this source.
   */
  async collect(): Promise<CollectorResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    log(`[${this.sourceId}] Starting collection from ${this.config.baseUrl}`);

    let exercises: NormalizedExercise[] = [];

    try {
      if (this.config.targetIds && this.config.targetIds.length > 0) {
        exercises = await this.collectByIds(this.config.targetIds);
      } else {
        exercises = await this.collectAll();
      }

      if (this.config.maxExercises > 0 && exercises.length > this.config.maxExercises) {
        exercises = exercises.slice(0, this.config.maxExercises);
      }
    } catch (error) {
      this.addError(undefined, error instanceof Error ? error.message : String(error));
    }

    const completedAt = new Date().toISOString();

    log(`[${this.sourceId}] Collected ${exercises.length} exercises (${this.errors.length} errors)`);

    return {
      source: this.sourceId,
      exercises,
      errors: this.errors,
      stats: {
        source: this.sourceId,
        totalRequested: this.config.targetIds?.length ?? 0,
        totalCollected: exercises.length,
        totalErrors: this.errors.length,
        durationMs: Date.now() - startMs,
        startedAt,
        completedAt,
      },
    };
  }

  /**
   * Collect all exercises from the source.
   */
  protected abstract collectAll(): Promise<NormalizedExercise[]>;

  /**
   * Collect specific exercises by their source IDs.
   */
  protected abstract collectByIds(ids: string[]): Promise<NormalizedExercise[]>;

  /**
   * Record an error during collection.
   */
  protected addError(exerciseId: string | undefined, message: string): void {
    this.errors.push({
      exerciseId,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Rate-limit between API requests.
   */
  protected async rateLimitDelay(): Promise<void> {
    if (this.config.rateLimit > 0) {
      await sleep(this.config.rateLimit);
    }
  }
}
