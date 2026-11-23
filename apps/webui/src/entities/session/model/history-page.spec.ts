import { describe, expect, test } from 'bun:test';
import type { ThreadHistoryPage, ThreadSummary } from '@harnesys/contracts';
import type { SessionEvent } from '@harnesys/studio-shared';
import type { SessionStoreState, ThreadHistoryWindow } from './session-types';
import { applyHistoryPage } from './thread-log';

const SUMMARY = { id: 't1' } as ThreadSummary;

const WINDOW: ThreadHistoryWindow = {
  minThreadSeq: 10,
  maxThreadSeq: 30,
  windowVersion: 4,
  hasMoreBefore: true,
  hasMoreAfter: false,
  hiddenRunsBefore: 12,
  firstUserThreadSeq: 3,
};

function userEvent(threadSeq: number): SessionEvent {
  return { type: 'user', text: 'START', clientEventId: `ce-${threadSeq}`, threadSeq };
}

function stateWith(events: SessionEvent[]): SessionStoreState {
  return {
    events: { t1: events },
    feeds: {},
    viewedSeq: {},
    seenAt: {},
    seqCeil: { t1: { 'run-old': 7 } },
    activeRuns: {},
    failures: [],
    contentEpoch: {},
    sentSkills: {},
    history: { t1: { ...WINDOW } },
    touchedAt: { t1: 1 },
    mountedThreads: [],
    focusedThreadId: null,
  };
}

function pageOf(overrides: Partial<ThreadHistoryPage>): ThreadHistoryPage {
  return {
    kind: 'before',
    summary: SUMMARY,
    events: [],
    minThreadSeq: 0,
    maxThreadSeq: 0,
    hasMoreBefore: false,
    hasMoreAfter: false,
    hiddenRunsBefore: null,
    firstUserThreadSeq: null,
    ...overrides,
  };
}

describe('applyHistoryPage', () => {
  test('an empty before page only clears hasMoreBefore and keeps the bounds', () => {
    const state = stateWith([userEvent(10), userEvent(20), userEvent(30)]);
    const next = applyHistoryPage(state, 't1', pageOf({ kind: 'before', events: [] }));
    expect(next.history.t1?.hasMoreBefore).toBe(false);
    expect(next.history.t1?.minThreadSeq).toBe(WINDOW.minThreadSeq);
    expect(next.history.t1?.maxThreadSeq).toBe(WINDOW.maxThreadSeq);
    expect(next.history.t1?.windowVersion).toBe(WINDOW.windowVersion);
    expect(next.history.t1?.firstUserThreadSeq).toBe(WINDOW.firstUserThreadSeq);
    expect(next.events.t1).toBe(state.events.t1);
  });

  test('a before page prepends and keeps the cursor and seq ceilings', () => {
    const state = stateWith([userEvent(10), userEvent(20)]);
    const next = applyHistoryPage(
      state,
      't1',
      pageOf({
        kind: 'before',
        events: [userEvent(4), userEvent(6)],
        minThreadSeq: 4,
        maxThreadSeq: 6,
        hasMoreBefore: false,
        hiddenRunsBefore: 0,
      }),
    );
    expect(next.events.t1?.map((event) => event.threadSeq)).toEqual([4, 6, 10, 20]);
    expect(next.history.t1?.minThreadSeq).toBe(4);
    expect(next.history.t1?.maxThreadSeq).toBe(WINDOW.maxThreadSeq);
    expect(next.history.t1?.windowVersion).toBe(WINDOW.windowVersion);
    expect(next.history.t1?.hiddenRunsBefore).toBe(0);
    expect(next.seqCeil.t1).toEqual({ 'run-old': 7 });
  });

  test('a range page replaces the requested interval and never resets seq ceilings', () => {
    const state = stateWith([userEvent(10), userEvent(20), userEvent(30)]);
    const next = applyHistoryPage(
      state,
      't1',
      pageOf({
        kind: 'range',
        events: [userEvent(12), userEvent(22)],
        minThreadSeq: 12,
        maxThreadSeq: 22,
      }),
      { rangeFrom: 10, rangeTo: 30 },
    );
    expect(next.events.t1?.map((event) => event.threadSeq)).toEqual([12, 22]);
    expect(next.history.t1?.maxThreadSeq).toBe(WINDOW.maxThreadSeq);
    expect(next.history.t1?.windowVersion).toBe(WINDOW.windowVersion);
    expect(next.history.t1?.hasMoreBefore).toBe(WINDOW.hasMoreBefore);
    expect(next.seqCeil.t1).toEqual({ 'run-old': 7 });
  });
});
