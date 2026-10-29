import { describe, expect, test } from 'bun:test';
import { InMemoryRunEventStore } from './in-memory-run-event-store.ts';

describe('InMemoryRunEventStore.removeUserEvent', () => {
  test('removes only the user event with matching seq', async () => {
    const store = new InMemoryRunEventStore();
    store.appendLocked('run-1', [
      { type: 'user', text: 'hello' },
      { type: 'text-delta', text: 'hi' },
    ]);
    const removed = await store.removeUserEvent('run-1', 1);
    expect(removed).toBe(true);
    const remaining = await store.tail('run-1', 0);
    expect(remaining.map((event) => event.type)).toEqual(['text-delta']);
    expect(await store.listByThread('')).toHaveLength(1);
  });

  test('refuses non-user events and unknown runs', async () => {
    const store = new InMemoryRunEventStore();
    store.appendLocked('run-1', [{ type: 'text-delta', text: 'hi' }]);
    expect(await store.removeUserEvent('run-1', 1)).toBe(false);
    expect(await store.removeUserEvent('missing', 1)).toBe(false);
    expect(await store.tail('run-1', 0)).toHaveLength(1);
  });
});

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
    const result = await store.truncateThreadFrom('', 'run-2', 1);
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
    await expect(store.truncateThreadFrom('', 'run-1', 99)).rejects.toThrow();
  });
});

describe('InMemoryRunEventStore.removeEvent', () => {
  test('removes a single error event without touching neighbours', async () => {
    const store = new InMemoryRunEventStore();
    store.appendLocked('run-1', [
      { type: 'user', text: 'hi' },
      { type: 'run.failed', message: 'boom' },
    ]);
    const removed = await store.removeEvent('', 'run-1', 2);
    expect(removed?.type).toBe('run.failed');
    const tail = await store.tail('run-1', 0);
    expect(tail.map((event) => event.type)).toEqual(['user']);
  });
});
