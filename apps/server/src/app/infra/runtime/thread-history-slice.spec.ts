import { describe, expect, test } from 'bun:test';
import type { ThreadKind, ThreadPolicy } from '@harnesys/contracts';
import type { SessionEvent } from 'harnesys';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import {
  sliceThreadHistory,
  threadHistorySegments,
  threadSliceOptsOf,
} from './thread-history-slice.ts';

const THREAD_ID = 'thread-1';
const ORG_ID = 'org-1';

function runEvents(runId: string, parts: SessionEvent[]): SessionEvent[] {
  return parts.map((part) => ({ ...part, runId }) as SessionEvent);
}

function user(text: string): SessionEvent {
  return { type: 'user', text };
}

function delta(text: string): SessionEvent {
  return { type: 'text-delta', text };
}

function compaction(id: string, summary: string, runId?: string): SessionEvent {
  return {
    type: 'compaction',
    id,
    reason: 'manual',
    coveredFrom: 0,
    coveredUntil: 0,
    tokensBefore: 1,
    tokensAfter: 1,
    summary,
    ...(runId ? { runId } : {}),
  };
}

function spawned(spawnId: string): SessionEvent {
  return { type: 'agent.spawned', agentId: 'parent', spawnId };
}

function threadRecord(policy: ThreadPolicy, kind: ThreadKind): ThreadRecord {
  const now = new Date().toISOString();
  return {
    id: THREAD_ID,
    orgId: ORG_ID,
    title: 't',
    kind,
    autoReplyAgentId: null,
    policy,
    lastThreadSeq: 0,
    conversationCount: 0,
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
}

function pick(events: SessionEvent[], index: number): SessionEvent {
  const event = events[index];
  if (!event) {
    throw new Error(`missing event at ${index}`);
  }
  return event;
}

function texts(events: SessionEvent[]): string[] {
  return events.map((event) => {
    if (event.type === 'user' || event.type === 'text-delta') {
      return event.text;
    }
    if (event.type === 'compaction') {
      return event.summary ?? '';
    }
    return event.type;
  });
}

describe('thread-history-slice', () => {
  test("'none' keeps only the newest compaction anchor plus the active run", () => {
    const events = [
      ...runEvents('run-a', [user('a'), delta('x')]),
      compaction('c1', 'summary', 'run-b'),
      ...runEvents('run-c', [user('c'), delta('y')]),
    ];
    const sliced = sliceThreadHistory(events, { mode: 'none' });
    expect(sliced).toEqual([pick(events, 2)]);
    const withActive = sliceThreadHistory(events, {
      mode: 'none',
      activeRunId: 'run-c',
    });
    expect(withActive).toEqual([pick(events, 2), pick(events, 3), pick(events, 4)]);
  });

  test('active run is included whole even when outside the last-N window', () => {
    const events = [
      ...runEvents('run-1', [user('one'), delta('d1'), delta('d2')]),
      ...runEvents('run-2', [user('two'), delta('d3')]),
      ...runEvents('run-3', [user('three'), delta('d4')]),
    ];
    const sliced = sliceThreadHistory(events, {
      mode: 'last',
      historyLast: 1,
      activeRunId: 'run-1',
    });
    expect(texts(sliced)).toEqual(['one', 'd1', 'd2', 'three', 'd4']);
  });

  test('last N counts run boundaries and null-run user turns, never cutting inside a run', () => {
    const events = [
      user('alone'),
      ...runEvents('run-1', [user('one'), delta('d1')]),
      user('alone-2'),
      ...runEvents('run-2', [user('two'), delta('d2')]),
    ];
    expect(threadHistorySegments(events).length).toBe(4);
    const lastTwo = sliceThreadHistory(events, { mode: 'last', historyLast: 2 });
    expect(texts(lastTwo)).toEqual(['alone-2', 'two', 'd2']);
    const all = sliceThreadHistory(events, { mode: 'last', historyLast: 10 });
    expect(all).toEqual(events);
  });

  test('a kept worker run co-keeps its parent marker run', () => {
    const events = [
      ...runEvents('run-p', [user('spawn'), spawned('spawn-1'), delta('parent work')]),
      ...runEvents('spawn-1', [user('worker input'), delta('worker work')]),
    ];
    const sliced = sliceThreadHistory(events, { mode: 'last', historyLast: 1 });
    expect(texts(sliced)).toEqual([
      'spawn',
      'agent.spawned',
      'parent work',
      'worker input',
      'worker work',
    ]);
  });

  test('the marker event survives an anchor cut between marker and worker run', () => {
    const events = [
      ...runEvents('run-p', [spawned('spawn-1')]),
      compaction('c1', 'fold', 'run-p'),
      ...runEvents('spawn-1', [delta('worker work')]),
    ];
    const sliced = sliceThreadHistory(events, { mode: 'last', historyLast: 5 });
    expect(sliced).toEqual([pick(events, 0), pick(events, 1), pick(events, 2)]);
  });

  test('historyFromRunId starts history at that run and falls back when it is gone', () => {
    const events = [
      ...runEvents('run-1', [user('one')]),
      ...runEvents('run-2', [user('two')]),
      ...runEvents('run-3', [user('three')]),
    ];
    const hinted = sliceThreadHistory(events, {
      mode: 'last',
      historyLast: 1,
      historyFromRunId: 'run-2',
    });
    expect(texts(hinted)).toEqual(['two', 'three']);
    const fallback = sliceThreadHistory(events, {
      mode: 'last',
      historyLast: 1,
      historyFromRunId: 'run-deleted',
    });
    expect(texts(fallback)).toEqual(['three']);
  });

  test('full mode folds everything before the newest anchor into it', () => {
    const events = [
      ...runEvents('run-1', [user('old')]),
      compaction('c1', 'first', 'run-1'),
      ...runEvents('run-2', [user('mid')]),
      compaction('c2', 'second', 'run-2'),
      ...runEvents('run-3', [user('new'), delta('d')]),
    ];
    const sliced = sliceThreadHistory(events, { mode: 'full' });
    expect(sliced).toEqual([pick(events, 3), pick(events, 4), pick(events, 5)]);
  });

  test('threadSliceOptsOf maps policy and kind defaults', () => {
    expect(threadSliceOptsOf(threadRecord({ version: 2 }, 'chat'), null)).toEqual({
      mode: 'full',
      historyLast: 10,
    });
    expect(threadSliceOptsOf(threadRecord({ version: 2 }, 'group'), null)).toEqual({
      mode: 'last',
      historyLast: 10,
    });
    expect(
      threadSliceOptsOf(
        threadRecord({ version: 2, historyMode: 'last', historyLast: 3 }, 'chat'),
        'run-9',
      ),
    ).toEqual({ mode: 'last', historyLast: 3, activeRunId: 'run-9' });
    expect(
      threadSliceOptsOf(
        threadRecord({ version: 1, historyFromRunId: 'run-2' } as ThreadPolicy, 'chat'),
        null,
      ),
    ).toEqual({ mode: 'full', historyLast: 10, historyFromRunId: 'run-2' });
  });
});
