import { expect, test } from 'bun:test';
import type { RunEventStore, SessionEvent } from 'harnesys';
import { resolveCompactBoundary, resolveCompactRunId } from './org-runtime-compact.ts';

const THREAD_ID = 'thread-1';

function fakeEvent(runId: string, seq: number): SessionEvent {
  return { type: 'user', text: 'hi', runId, seq } as SessionEvent;
}

function fakeStore(runs: string[], events: SessionEvent[]): RunEventStore {
  const runSet = new Set(runs);
  return {
    append: () => {
      throw new Error('not used');
    },
    tail: () => {
      throw new Error('not used');
    },
    latestSeq: () => {
      throw new Error('not used');
    },
    listByThread: (threadId) => Promise.resolve(threadId === THREAD_ID ? events : []),
    hasRun: (runId) => Promise.resolve(runSet.has(runId)),
    appendForThread: () => {
      throw new Error('not used');
    },
    removeUserEvent: () => {
      throw new Error('not used');
    },
    truncateThreadFrom: () => {
      throw new Error('not used');
    },
    removeEvent: () => {
      throw new Error('not used');
    },
    next: () => {
      throw new Error('not used');
    },
  };
}

test('keeps the snapshot runId when the run exists', async () => {
  const store = fakeStore(['run-live'], [fakeEvent('run-live', 1)]);
  const runId = await resolveCompactRunId(store, THREAD_ID, 'run-live');
  expect(runId).toBe('run-live');
});

test('a seeded synthetic runId falls back to the newest run in the journal', async () => {
  const events = [fakeEvent('run-old', 1), fakeEvent('run-old', 2), fakeEvent('run-new', 1)];
  const store = fakeStore(['run-old', 'run-new'], events);
  const runId = await resolveCompactRunId(store, THREAD_ID, 'seed-fake');
  expect(runId).toBe('run-new');
});

test('no journal events resolve to undefined so the append is skipped', async () => {
  const store = fakeStore([], []);
  const runId = await resolveCompactRunId(store, THREAD_ID, 'seed-fake');
  expect(runId).toBeUndefined();
});

test('boundary resolves to the source event of the last covered message', async () => {
  const events = [fakeEvent('run-1', 1), fakeEvent('run-1', 2), fakeEvent('run-2', 1)];
  const store = fakeStore(['run-1', 'run-2'], events);
  const boundary = await resolveCompactBoundary(store, THREAD_ID, 1, 3);
  expect(boundary).toEqual({ runId: 'run-1', seq: 2 });
});

test('boundary persists even when the compaction covered the whole history', async () => {
  const events = [fakeEvent('run-1', 1), fakeEvent('run-1', 2)];
  const store = fakeStore(['run-1'], events);
  const boundary = await resolveCompactBoundary(store, THREAD_ID, 1, 2);
  expect(boundary).toEqual({ runId: 'run-1', seq: 2 });
});

test('boundary is null when the replay diverges from the compacted state', async () => {
  const events = [fakeEvent('run-1', 1), fakeEvent('run-1', 2), fakeEvent('run-2', 1)];
  const store = fakeStore(['run-1', 'run-2'], events);
  const boundary = await resolveCompactBoundary(store, THREAD_ID, 1, 7);
  expect(boundary).toBeNull();
});
