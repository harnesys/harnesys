import { describe, expect, test } from 'bun:test';
import type { RunRecord } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';
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

  test('publishes create and transition events exactly once', async () => {
    const batches: Array<{ threadId: string; runId: string; events: SessionEvent[] }> = [];
    const events = new InMemoryRunEventStore((threadId, runId, batch) => {
      batches.push({ threadId, runId, events: batch });
    });
    const store = new InMemoryRunLifecycleStore(events);
    const created = await store.create(
      { runId: 'run-1', threadId: 'thread-1', agentId: 'agent-1', agentName: 'Agent' },
      [{ type: 'user', text: 'hello' }],
    );
    const claimed = await store.claim(created.runId, 'instance-1', 1_000);
    if (!claimed) {
      throw new Error('run was not claimed');
    }
    await store.transition(claimed.runId, claimed.leaseEpoch, {
      from: 'running',
      to: 'completed',
      events: [{ type: 'run.completed' }],
    });

    expect(batches).toHaveLength(2);
    expect(batches[0]?.threadId).toBe('thread-1');
    expect(batches[0]?.events.map((event) => event.type)).toEqual(['user']);
    expect(batches[1]?.events.map((event) => event.type)).toEqual(['run.completed']);
  });
});
