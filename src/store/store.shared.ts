/**
 * `runStoreTests(factory)` — driver-agnostic conformance suite for
 * `SessionStore`. Both `sqlite-node` and `sqlite-expo` driver test files
 * import this and call it with their factory. The driver-specific test files
 * stay tiny; the shared suite covers the cross-driver contract.
 *
 * Coverage map (from the briefing's "covered by `runStoreTests`" list):
 *   AC-05, AC-06, AC-07, AC-08, AC-09, AC-30, AC-31, AC-32, AC-33, AC-34,
 *   AC-35, AC-38, EC-06, EC-10, EC-11, EC-12, EC-13, EC-14.
 *
 * The suite is registered via Vitest's `describe`/`it`. Tests inside it run
 * only when a driver-side test file invokes `runStoreTests(factory)` — this
 * file itself never runs the suite (the driver factories don't exist yet).
 *
 * Round-trip equality (D11 / AC-06): "deeply equal except `schemaVersion` may
 * be overwritten." The helper `expectRoundTrip` asserts that.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RepRecord, SetRecord, Session } from '../schema/types.js';
import type { SessionStore } from './session-store.js';

// ---------------------------------------------------------------- fixtures

export const sampleSession: Session = {
  id: 'session-fixture-1',
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_900_000,
  exerciseId: 'squat',
  deviceId: 'device-1',
  notes: 'fixture session',
  schemaVersion: 1,
};

export const sampleSet: SetRecord = {
  id: 'set-fixture-1',
  sessionId: sampleSession.id,
  setNumber: 1,
  loadKg: 100,
  loadType: 'absolute',
  schemaVersion: 1,
};

export const sampleReps: readonly RepRecord[] = [
  {
    id: 'rep-fixture-1',
    setId: sampleSet.id,
    repNumber: 1,
    rawSamplesJson: '{"concentric":[],"eccentric":[]}',
    schemaVersion: 1,
  },
  {
    id: 'rep-fixture-2',
    setId: sampleSet.id,
    repNumber: 2,
    rawSamplesJson: '{"concentric":[{"t":1,"v":0.5}],"eccentric":[]}',
    schemaVersion: 1,
  },
  {
    id: 'rep-fixture-3',
    setId: sampleSet.id,
    repNumber: 3,
    rawSamplesJson: '{"concentric":[],"eccentric":[{"t":2,"v":0.4}]}',
    schemaVersion: 1,
  },
];

// ---------------------------------------------------------------- helpers

function withoutSchemaVersion<T extends { schemaVersion: number }>(
  record: T
): Omit<T, 'schemaVersion'> {
  const copy = { ...record };
  delete (copy as { schemaVersion?: number }).schemaVersion;
  return copy;
}

/**
 * Round-trip equality: deeply equal modulo `schemaVersion`.
 * `actual.schemaVersion` must be a positive integer (the store overwrote it
 * with `latestAppliedVersion`).
 */
function expectRoundTrip<T extends { schemaVersion: number }>(actual: T, expected: T): void {
  expect(withoutSchemaVersion(actual)).toEqual(withoutSchemaVersion(expected));
  expect(Number.isInteger(actual.schemaVersion)).toBe(true);
  expect(actual.schemaVersion).toBeGreaterThan(0);
}

export type StoreFactory = () => Promise<SessionStore> | SessionStore;

// ---------------------------------------------------------------- the suite

export function runStoreTests(factoryName: string, factory: StoreFactory): void {
  describe(`SessionStore conformance (${factoryName})`, () => {
    let store: SessionStore;

    beforeEach(async () => {
      store = await factory();
    });

    afterEach(async () => {
      // close() is idempotent (v5R-8); afterEach is safe even if a test
      // closed already.
      try {
        await store.close();
      } catch {
        // Tests may have left the store in a closed state intentionally.
      }
    });

    // ------------------------------------------------------------ AC-05
    describe('save path validates and overwrites schemaVersion (AC-05)', () => {
      it('saveSession does not mutate caller input (D2 / v5R-12)', async () => {
        const input: Session = { ...sampleSession, schemaVersion: 999 };
        const before = JSON.stringify(input);
        await store.saveSession(input);
        expect(JSON.stringify(input)).toBe(before);
      });

      it('persisted session.schemaVersion matches latestAppliedVersion, not caller value', async () => {
        const input: Session = { ...sampleSession, schemaVersion: 999 };
        await store.saveSession(input);
        const out = await store.getSession(input.id);
        expect(out).toBeDefined();
        expect(out!.schemaVersion).not.toBe(999);
      });
    });

    // ------------------------------------------------------------ AC-06 / AC-07
    describe('round-trip (AC-06 / AC-07)', () => {
      it('saved session round-trips deeply equal modulo schemaVersion', async () => {
        await store.saveSession(sampleSession);
        const out = await store.getSession(sampleSession.id);
        expect(out).toBeDefined();
        expectRoundTrip(out!, sampleSession);
      });

      it('saved set round-trips', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        const sets = await store.getSetsBySession(sampleSession.id);
        expect(sets).toHaveLength(1);
        expectRoundTrip(sets[0]!, sampleSet);
      });

      it('saved reps round-trip preserving rawSamplesJson byte-for-byte', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        await store.saveReps(sampleReps);
        const reps = await store.getRepsBySet(sampleSet.id);
        expect(reps).toHaveLength(sampleReps.length);
        for (let i = 0; i < sampleReps.length; i++) {
          expectRoundTrip(reps[i]!, sampleReps[i]!);
          expect(reps[i]!.rawSamplesJson).toBe(sampleReps[i]!.rawSamplesJson);
        }
      });
    });

    // ------------------------------------------------------------ AC-08 / AC-30 / AC-31
    describe('connection lifecycle (AC-08 / AC-30 / AC-31)', () => {
      it('store is usable immediately after factory (AC-08 / AC-30)', async () => {
        // Factory completed in beforeEach; first call should succeed.
        await store.saveSession(sampleSession);
        const out = await store.getSession(sampleSession.id);
        expect(out).toBeDefined();
      });
    });

    // ------------------------------------------------------------ AC-09 / AC-38
    describe('reads ascending order (AC-09 / AC-38 / v5R-11)', () => {
      it('getSetsBySession returns sets ordered by set_number ascending', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet({ ...sampleSet, id: 'set-3', setNumber: 3 });
        await store.saveSet({ ...sampleSet, id: 'set-1', setNumber: 1 });
        await store.saveSet({ ...sampleSet, id: 'set-2', setNumber: 2 });
        const sets = await store.getSetsBySession(sampleSession.id);
        expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
      });

      it('getRepsBySet returns reps ordered by rep_number ascending', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        // Insert in shuffled order to prove ordering is from the SQL, not
        // insertion order.
        const shuffled = [sampleReps[2]!, sampleReps[0]!, sampleReps[1]!];
        await store.saveReps(shuffled);
        const reps = await store.getRepsBySet(sampleSet.id);
        expect(reps.map((r) => r.repNumber)).toEqual([1, 2, 3]);
      });

      it('getRecent returns sessions newest-first (descending startedAt)', async () => {
        await store.saveSession({ ...sampleSession, id: 's-old', startedAt: 1000 });
        await store.saveSession({ ...sampleSession, id: 's-mid', startedAt: 2000 });
        await store.saveSession({ ...sampleSession, id: 's-new', startedAt: 3000 });
        const recent = await store.getRecent(10);
        expect(recent.map((s) => s.id)).toEqual(['s-new', 's-mid', 's-old']);
      });
    });

    // ------------------------------------------------------------ AC-32 / EC-06 (concurrency)
    describe('concurrency (AC-32 / AC-CONCURRENCY / EC-06)', () => {
      it('concurrent saveReps calls serialize without BEGIN-BEGIN race', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        const setB: SetRecord = { ...sampleSet, id: 'set-b', setNumber: 2 };
        await store.saveSet(setB);

        const repsA: RepRecord[] = sampleReps.map((r, i) => ({
          ...r,
          id: `a-${i}`,
          setId: sampleSet.id,
        }));
        const repsB: RepRecord[] = sampleReps.map((r, i) => ({
          ...r,
          id: `b-${i}`,
          setId: setB.id,
        }));

        await Promise.all([store.saveReps(repsA), store.saveReps(repsB)]);

        const a = await store.getRepsBySet(sampleSet.id);
        const b = await store.getRepsBySet(setB.id);
        expect(a).toHaveLength(repsA.length);
        expect(b).toHaveLength(repsB.length);
      });
    });

    // ------------------------------------------------------------ AC-33 (duplicate id)
    describe('duplicate id (AC-33 / AC-DUP / v5R-2)', () => {
      it('saveSession throws StoreError on duplicate id', async () => {
        await store.saveSession(sampleSession);
        await expect(store.saveSession(sampleSession)).rejects.toThrow(/duplicate id/);
      });

      it('saveSet throws StoreError on duplicate id', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        await expect(store.saveSet(sampleSet)).rejects.toThrow(/duplicate id/);
      });

      it('saveReps with a duplicate id rolls back the entire batch (AC-14)', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        await store.saveReps([sampleReps[0]!]);

        const batch: RepRecord[] = [
          { ...sampleReps[1]! },
          { ...sampleReps[0]! }, // duplicate
        ];
        await expect(store.saveReps(batch)).rejects.toThrow(/duplicate id/);

        // Pre-existing rep stays; the second batch member is NOT visible.
        const reps = await store.getRepsBySet(sampleSet.id);
        const ids = reps.map((r) => r.id).sort();
        expect(ids).toEqual([sampleReps[0]!.id]);
      });
    });

    // ------------------------------------------------------------ AC-34 / EC-10..13 (limit)
    describe('getRecent input validation (AC-34 / AC-LIMIT-VALIDATION / EC-10..13)', () => {
      it('getRecent(-1) throws StoreError', async () => {
        await expect(store.getRecent(-1)).rejects.toThrow(/invalid limit/);
      });
      it('getRecent(NaN) throws StoreError', async () => {
        await expect(store.getRecent(Number.NaN)).rejects.toThrow(/invalid limit/);
      });
      it('getRecent(1.5) throws StoreError', async () => {
        await expect(store.getRecent(1.5)).rejects.toThrow(/invalid limit/);
      });
      it('getRecent(0) is allowed and returns []', async () => {
        await store.saveSession(sampleSession);
        const out = await store.getRecent(0);
        expect(out).toEqual([]);
      });
    });

    // ------------------------------------------------------------ AC-35 (close idempotency)
    describe('close idempotency (AC-35 / AC-CLOSE-IDEMPOTENT / v5R-8)', () => {
      it('close() called twice resolves both times', async () => {
        await store.close();
        await store.close();
      });

      it('saveSession after close throws "store is closed"', async () => {
        await store.close();
        await expect(store.saveSession(sampleSession)).rejects.toThrow(/store is closed/);
      });

      it('getSession after close throws "store is closed"', async () => {
        await store.close();
        await expect(store.getSession(sampleSession.id)).rejects.toThrow(/store is closed/);
      });
    });

    // ------------------------------------------------------------ EC-14 (saveReps([]))
    describe('saveReps([]) is a no-op (v5R-3 / EC-EMPTY-REPS / EC-14)', () => {
      it('saveReps([]) resolves without throwing and persists nothing', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        await store.saveReps([]);
        const reps = await store.getRepsBySet(sampleSet.id);
        expect(reps).toEqual([]);
      });
    });

    // ------------------------------------------------------------ missing-row reads (AC-15)
    describe('missing-row reads return undefined / [] (D16 / AC-15)', () => {
      it('getSession for an unknown id resolves to undefined', async () => {
        const out = await store.getSession('does-not-exist');
        expect(out).toBeUndefined();
      });

      it('getSetsBySession for an unknown session resolves to []', async () => {
        const out = await store.getSetsBySession('does-not-exist');
        expect(out).toEqual([]);
      });

      it('getRepsBySet for an unknown set resolves to []', async () => {
        const out = await store.getRepsBySet('does-not-exist');
        expect(out).toEqual([]);
      });
    });

    // ------------------------------------------------------------ corruption probe on rep load
    describe('rawSamplesJson corruption probe (v5R-4 / FIX-5)', () => {
      it('valid JSON in rawSamplesJson loads without throwing', async () => {
        await store.saveSession(sampleSession);
        await store.saveSet(sampleSet);
        await store.saveReps([sampleReps[0]!]);
        const reps = await store.getRepsBySet(sampleSet.id);
        expect(reps[0]!.rawSamplesJson).toBe(sampleReps[0]!.rawSamplesJson);
      });
    });
  });
}
