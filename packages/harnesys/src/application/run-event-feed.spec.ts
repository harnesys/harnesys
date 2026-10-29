import { describe, expect, test } from 'bun:test';
import type { RunEventBus } from '../adapters/run-event-bus.ts';
import { createRunEventBus } from '../adapters/run-event-bus.ts';
import type { RunLifecycleStatus, RunRecord } from '../ports/run-lifecycle-store.ts';
import type { SessionEvent } from '../ports/session.ts';
import { createRunEventFeed, type RunEventFeedDeps } from './run-event-feed.ts';

const IDLE_MS = 10;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function retryEvent(attempt: number): SessionEvent {
  return {
    type: 'model.retry',
    attempt,
    maxRetries: 3,
    delayMs: 30_000,
    message: `Retrying ${attempt}/3`,
    seq: 10 + attempt,
    runId: 'r1',
  };
}

function record(status: RunLifecycleStatus): RunRecord {
  return {
    runId: 'r1',
    threadId: 't1',
    status,
    attempt: 1,
    leaseEpoch: 1,
    lastSeq: 12,
    createdAt: '2026-10-05T00:00:00.000Z',
    updatedAt: '2026-10-05T00:00:00.000Z',
  };
}

function makeDeps(
  status: () => RunLifecycleStatus | null,
  tail: SessionEvent[] = [],
): Omit<RunEventFeedDeps, 'bus'> {
  return {
    events: { tail: async () => tail },
    lifecycle: {
      get: async () => {
        const current = status();
        return current === null ? null : record(current);
      },
    },
    idleMs: IDLE_MS,
  };
}

function makeFeed(
  bus: RunEventBus,
  status: () => RunLifecycleStatus | null,
): ReturnType<typeof createRunEventFeed> {
  return createRunEventFeed({ ...makeDeps(status), bus });
}

describe('run event feed subscribe', () => {
  test('delivers events published after an idle backstop timeout', async () => {
    const bus = createRunEventBus();
    let closed = false;
    const feed = makeFeed(bus, () => (closed ? 'failed' : null));
    const it = feed.subscribe('r1', 0)[Symbol.asyncIterator]();
    const first = it.next();
    await sleep(IDLE_MS * 3);
    const ev1 = retryEvent(1);
    const ev2 = retryEvent(2);
    bus.publish('r1', [ev1]);
    bus.publish('r1', [ev2]);
    expect((await first).value).toEqual(ev1);
    expect((await it.next()).value).toEqual(ev2);
    closed = true;
    expect((await it.next()).done).toBe(true);
  });
  test('stays open on needs_input so a later answer is delivered', async () => {
    const bus = createRunEventBus();
    const feed = makeFeed(bus, () => 'needs_input');
    const it = feed.subscribe('r1', 0)[Symbol.asyncIterator]();
    const pending = it.next();
    await sleep(IDLE_MS * 2);
    const ask = {
      type: 'ask',
      askId: 'a1',
      schema: {},
      source: 'ask_user',
      seq: 3,
      runId: 'r1',
    } as SessionEvent;
    bus.publish('r1', [ask]);
    expect((await pending).value).toEqual(ask);
    const answer = {
      type: 'hitl.answer',
      interruptId: 'a1',
      payload: { choice: 'ok' },
      seq: 4,
      runId: 'r1',
    } as SessionEvent;
    bus.publish('r1', [answer]);
    expect((await it.next()).value).toEqual(answer);
    await it.return?.(undefined);
  });
  test('skips events already covered by the journal tail', async () => {
    const bus = createRunEventBus();
    const ev1 = retryEvent(1);
    const feed = createRunEventFeed({ ...makeDeps(() => null, [ev1]), bus });
    const it = feed.subscribe('r1', 0)[Symbol.asyncIterator]();
    expect((await it.next()).value).toEqual(ev1);
    bus.publish('r1', [ev1]);
    const ev2 = retryEvent(2);
    bus.publish('r1', [ev2]);
    expect((await it.next()).value).toEqual(ev2);
  });
});
