import { describe, expect, test } from 'bun:test';
import type { RunRecord } from '../ports/run-lifecycle-store.ts';
import { InMemoryRunEventStore } from './in-memory-run-event-store.ts';
import { InMemoryRunLifecycleStore } from './in-memory-run-lifecycle-store.ts';

function record(patch: Partial<RunRecord> & { runId: string }): RunRecord {
  const now = new Date().toISOString();
  return {
    threadId: 'thread-1',
    status: 'running',
    attempt: 1,
    leaseEpoch: 1,
    lastSeq: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe('in-memory run lifecycle store', () => {
  test('listStaleRunning skips child rows parked without a lease', async () => {
    const store = new InMemoryRunLifecycleStore(new InMemoryRunEventStore());
    const now = Date.now();
    store.runs.set(
      'child-1',
      record({
        runId: 'child-1',
        parentRunId: 'root-1',
        updatedAt: new Date(now - 120_000).toISOString(),
      }),
    );
    const stale = await store.listStaleRunning({ now });
    expect(stale).toEqual([]);
  });

  test('listStaleRunning lists a stale root run', async () => {
    const store = new InMemoryRunLifecycleStore(new InMemoryRunEventStore());
    const now = Date.now();
    store.runs.set(
      'root-1',
      record({
        runId: 'root-1',
        leaseExpiresAt: now - 120_000,
        updatedAt: new Date(now - 120_000).toISOString(),
      }),
    );
    const stale = await store.listStaleRunning({ now });
    expect(stale.map((rec) => rec.runId)).toEqual(['root-1']);
  });
});
