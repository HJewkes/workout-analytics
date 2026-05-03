/**
 * Smoke test: invoke `runStoreTests` against a minimal in-memory mock
 * `SessionStore`. This catches structural bugs in the shared harness (typos
 * in `it` blocks, mis-shaped assertions, missing awaits) before the real
 * Node and Expo drivers land in WA-04.04 / WA-04.05.
 *
 * The mock implements just enough behavior to satisfy the harness contract.
 * It is NOT a reference implementation — it has no migrations, no SQL, no
 * pragmas — but it shares the in-memory data model and error semantics
 * (duplicate id, close idempotency, ordering, validation) the harness
 * asserts. When WA-04.04 lands, the real driver replaces this mock and the
 * same suite runs against actual SQLite.
 */

import { prepareForSave } from '@/store/prepare-for-save';
import { repRecordSchema, setRecordSchema, sessionSchema } from '@/schema/validators';
import type { RepRecord, SetRecord, Session } from '@/schema/types';
import type { SessionStore } from '@/store/session-store';
import { StoreError } from '@/store/errors';
import { runStoreTests } from '@/store/store.shared';

const LATEST_VERSION = 1;

class InMemoryStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly sets = new Map<string, SetRecord>();
  private readonly reps = new Map<string, RepRecord>();
  private closed = false;
  private lock: Promise<void> = Promise.resolve();

  private guard(): void {
    if (this.closed) throw new StoreError('store is closed');
  }

  /** Promise-mutex used for concurrency tests (mirrors the Expo driver shape). */
  private async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.lock;
    let release!: () => void;
    this.lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await previous;
      return await fn();
    } finally {
      release();
    }
  }

  async saveSession(session: Session): Promise<void> {
    this.guard();
    return this.withLock(() => {
      const prepared = prepareForSave(sessionSchema, session, LATEST_VERSION);
      if (this.sessions.has(prepared.id)) {
        throw new StoreError(`duplicate id: ${prepared.id}`);
      }
      this.sessions.set(prepared.id, prepared);
    });
  }

  async saveSet(set: SetRecord): Promise<void> {
    this.guard();
    return this.withLock(() => {
      const prepared = prepareForSave(setRecordSchema, set, LATEST_VERSION);
      if (this.sets.has(prepared.id)) {
        throw new StoreError(`duplicate id: ${prepared.id}`);
      }
      this.sets.set(prepared.id, prepared);
    });
  }

  async saveReps(reps: readonly RepRecord[]): Promise<void> {
    this.guard();
    if (reps.length === 0) return; // v5R-3 — no transaction opened
    return this.withLock(() => {
      // Atomic: validate-and-stage all, then commit. Throws roll back.
      const staged: RepRecord[] = [];
      for (const rep of reps) {
        const prepared = prepareForSave(repRecordSchema, rep, LATEST_VERSION);
        if (this.reps.has(prepared.id) || staged.some((s) => s.id === prepared.id)) {
          throw new StoreError(`duplicate id: ${prepared.id}`);
        }
        staged.push(prepared);
      }
      for (const rep of staged) this.reps.set(rep.id, rep);
    });
  }

  async getSession(id: string): Promise<Session | undefined> {
    this.guard();
    const stored = this.sessions.get(id);
    return stored ? { ...stored } : undefined;
  }

  async getSetsBySession(sessionId: string): Promise<SetRecord[]> {
    this.guard();
    return Array.from(this.sets.values())
      .filter((s) => s.sessionId === sessionId)
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s) => ({ ...s }));
  }

  async getRepsBySet(setId: string): Promise<RepRecord[]> {
    this.guard();
    return Array.from(this.reps.values())
      .filter((r) => r.setId === setId)
      .sort((a, b) => a.repNumber - b.repNumber)
      .map((r) => ({ ...r }));
  }

  async getRecent(limit: number): Promise<Session[]> {
    this.guard();
    if (!Number.isInteger(limit) || limit < 0) {
      throw new StoreError(`invalid limit: ${String(limit)}`);
    }
    return Array.from(this.sessions.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit)
      .map((s) => ({ ...s }));
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

runStoreTests('in-memory smoke', () => new InMemoryStore());
