import { expect, test } from 'bun:test';
import type { CompactionMessage, PendingSessionEvent, RunEventStore, SessionEvent } from 'harnesys';
import { manualAnchorEvent, resolveCompactRunId } from './org-runtime-compact.ts';

const THREAD_ID = 'thread-1';

function completedOf(extra: Partial<CompactionMessage>): CompactionMessage {
  return {
    role: 'assistant',
    kind: 'compaction',
    id: 'k1',
    content: 'SUMMARY',
    coveredFrom: 0,
    coveredUntil: 1,
    reason: 'manual',
    stats: { tokensBefore: 0, tokensAfter: 0, coveredCount: 2 },
    createdAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  };
}

function fakeEvent(runId: string, seq: number, threadSeq?: number): SessionEvent {
  return { type: 'user', text: 'hi', runId, seq, threadSeq } as SessionEvent;
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
    listByRun: () => {
      throw new Error('not used');
    },
    listByThread: (threadId) => Promise.resolve(threadId === THREAD_ID ? events : []),
    eventAt: (_threadId, threadSeq) =>
      Promise.resolve(events.find((event) => event.threadSeq === threadSeq) ?? null),
    hasRun: (runId) => Promise.resolve(runSet.has(runId)),
    appendForThread: () => {
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

test('an engSeq-only boundary degrades instead of writing an empty cursor', () => {
  const anchor = manualAnchorEvent(
    completedOf({ coveredUntilEngSeq: 7, coveredKind: 'tool', coveredToolCallId: 'c1' }),
    3,
  ) as Extract<PendingSessionEvent, { type: 'compaction' }>;
  expect(anchor.durable).toBe(false);
  expect(typeof anchor.unresolvedReason).toBe('string');
  expect(anchor.coveredUntilRunId).toBeUndefined();
  expect(anchor.coveredUntilSeq).toBeUndefined();
});

test('an unsourced boundary degrades instead of writing an empty cursor', () => {
  const anchor = manualAnchorEvent(completedOf({}), 3) as Extract<
    PendingSessionEvent,
    { type: 'compaction' }
  >;
  expect(anchor.durable).toBe(false);
  expect(typeof anchor.unresolvedReason).toBe('string');
});

test('a run-coordinate boundary keeps the exact cursor', () => {
  const anchor = manualAnchorEvent(
    completedOf({
      coveredUntilRunId: 'r1',
      coveredUntilSeq: 4,
      coveredKind: 'tool',
      coveredToolCallId: 'c1',
    }),
    3,
  ) as Extract<PendingSessionEvent, { type: 'compaction' }>;
  expect(anchor.durable).not.toBe(false);
  expect(anchor.unresolvedReason).toBeUndefined();
  expect(anchor.coveredUntilRunId).toBe('r1');
  expect(anchor.coveredUntilSeq).toBe(4);
  expect(anchor.coveredKind).toBe('tool');
  expect(anchor.coveredToolCallId).toBe('c1');
});
