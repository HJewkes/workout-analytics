/**
 * Schema record types for the storage layer.
 *
 * The store overwrites `schemaVersion` on save (D2 / D-COL); callers may pass any
 * value but should expect the store's `latestAppliedVersion` to be persisted.
 */

export type SchemaVersion = number;

export interface Session {
  /** Caller-supplied identifier. ID generation is out of scope for the storage layer. */
  id: string;
  /** Epoch milliseconds. */
  startedAt: number;
  /** Epoch milliseconds. Optional — set when the session ends. */
  endedAt?: number;
  /** Links to the exercises catalog. The store does not validate this reference. */
  exerciseId?: string;
  deviceId?: string;
  notes?: string;
  /** Overwritten by the store on save (D2 / D-COL). */
  schemaVersion: SchemaVersion;
}

export interface SetRecord {
  id: string;
  /** FK to `sessions.id`. */
  sessionId: string;
  setNumber: number;
  loadKg?: number;
  loadType?: 'absolute' | 'percent1RM';
  schemaVersion: SchemaVersion;
}

export interface RepRecord {
  id: string;
  /** FK to `sets.id`. */
  setId: string;
  repNumber: number;
  /**
   * Serialized `{ concentric: WorkoutSample[], eccentric: WorkoutSample[] }`.
   * The store treats this as an opaque string but verifies JSON-parseability on load
   * (corruption probe; v5R-4). The runtime field stays a string.
   */
  rawSamplesJson: string;
  schemaVersion: SchemaVersion;
}
