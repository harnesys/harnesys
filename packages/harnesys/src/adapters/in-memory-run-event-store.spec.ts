import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '../ports/session.ts';
import { InMemoryRunEventStore } from './in-memory-run-event-store.ts';

describe('InMemoryRunEventStore.truncateThreadFrom', () => {
  test('removes cutoff user event and every later thread event', async () => {
    const store = new InMemoryRunEventStore();
    store.appendLocked('run-1', [
      { type: 'user', text: 'first' },
      { type: 'text-delta', text: 'answer one' },
      { type: 'run.completed', text: 'done' },
    ]);
    store.appendLocked('run-2', [
      { type: 'user', text: 'second' },
      { type: 'text-delta', text: 'answer two' },
      { type: 'run.failed', message: 'boom' },
    ]);
    const result = await store.truncateThreadFrom('', 4);
    expect(result.cutoff.type).toBe('user');
    expect(result.removedEvents).toBe(3);
    expect(result.remainingUserCount).toBe(1);
    const tail = await store.tail('run-1', 0);
    expect(tail.map((event) => event.type)).toEqual(['user', 'text-delta', 'run.completed']);
    expect(await store.tail('run-2', 0)).toHaveLength(0);
  });

  test('rejects unknown events', async () => {
    const store = new InMemoryRunEventStore();
    store.appendLocked('run-1', [{ type: 'user', text: 'hi' }]);
    await expect(store.truncateThreadFrom('', 99)).rejects.toThrow();
  });
});

describe('InMemoryRunEventStore append sink', () => {
  test('publishes each stored batch once with the run thread', () => {
    const batches: Array<{ threadId: string; runId: string; events: SessionEvent[] }> = [];
    const store = new InMemoryRunEventStore((threadId, runId, events) => {
      batches.push({ threadId, runId, events });
    });
    store.appendLocked('run-1', [{ type: 'user', text: 'first' }], 'thread-1');
    store.appendLocked('run-1', [{ type: 'text-delta', text: 'second' }], 'thread-1');

    expect(batches).toHaveLength(2);
    expect(batches[0]?.threadId).toBe('thread-1');
    expect(batches[0]?.runId).toBe('run-1');
    expect(batches[0]?.events.map((event) => event.seq)).toEqual([1]);
    expect(batches[1]?.events.map((event) => event.seq)).toEqual([2]);
  });
});

describe('InMemoryRunEventStore.removeEvent', () => {
  test('removes a single error event without touching neighbours', async () => {
    const store = new InMemoryRunEventStore();
    store.appendLocked('run-1', [
      { type: 'user', text: 'hi' },
      { type: 'run.failed', message: 'boom' },
    ]);
    const removed = await store.removeEvent('', 2);
    expect(removed?.type).toBe('run.failed');
    const tail = await store.tail('run-1', 0);
    expect(tail.map((event) => event.type)).toEqual(['user']);
  });
});
