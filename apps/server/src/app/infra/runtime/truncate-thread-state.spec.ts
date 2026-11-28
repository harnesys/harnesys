import { expect, test } from 'bun:test';
import type { PendingSessionEvent, SessionHandle } from 'harnesys';
import { InMemoryRunEventStore, InMemoryRunLifecycleStore } from 'harnesys';
import { type ThreadHistoryDeps, undoThreadCompaction } from './truncate-thread-state.ts';

function depsWith(events: InMemoryRunEventStore): ThreadHistoryDeps {
  return {
    events,
    sessions: new Map(),
    lifecycle: new InMemoryRunLifecycleStore(events),
    sessionFor: (): Promise<SessionHandle> => Promise.reject(new Error('not used')),
  };
}

test('undo removes the compaction progress marker, its deltas and the anchor together', async () => {
  const events = new InMemoryRunEventStore();
  const threadId = 'thread-1';
  await events.appendForThread(threadId, 'run-1', [
    { type: 'user', text: 'hello' } as PendingSessionEvent,
    {
      type: 'compaction.progress',
      id: 'c1',
      phase: 'started',
      reason: 'manual',
      coveredFrom: 0,
      coveredUntil: 1,
    } as PendingSessionEvent,
    { type: 'text-delta', text: 'summary', id: 'd1' } as PendingSessionEvent,
    {
      type: 'compaction',
      id: 'c1',
      reason: 'manual',
      coveredFrom: 0,
      coveredUntil: 1,
      tokensBefore: 100,
      tokensAfter: 20,
    } as PendingSessionEvent,
    { type: 'user', text: 'after' } as PendingSessionEvent,
  ]);

  const removed = await undoThreadCompaction(depsWith(events), threadId);

  expect(removed.type).toBe('compaction');
  const remaining = await events.listByThread(threadId);
  expect(remaining.map((event) => event.type)).toEqual(['user', 'user']);
});

test('undo without a progress marker removes only the anchor', async () => {
  const events = new InMemoryRunEventStore();
  const threadId = 'thread-1';
  await events.appendForThread(threadId, 'run-1', [
    { type: 'user', text: 'hello' } as PendingSessionEvent,
    {
      type: 'compaction',
      id: 'c1',
      reason: 'manual',
      coveredFrom: 0,
      coveredUntil: 1,
      tokensBefore: 100,
      tokensAfter: 20,
    } as PendingSessionEvent,
  ]);

  const removed = await undoThreadCompaction(depsWith(events), threadId);

  expect(removed.type).toBe('compaction');
  const remaining = await events.listByThread(threadId);
  expect(remaining.map((event) => event.type)).toEqual(['user']);
});
