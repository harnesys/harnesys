import { describe, expect, test } from 'bun:test';
import type { SessionEvent } from '@harnesys/studio-shared';
import { dropDeletedEvents } from './apply-deletions';
import type { SessionStoreState, ThreadHistoryWindow } from './session-types';

function userEvent(threadSeq: number, clientEventId: string): SessionEvent {
  return { type: 'user', text: 'START', clientEventId, threadSeq };
}

const WINDOW: ThreadHistoryWindow = {
  minThreadSeq: 4,
  maxThreadSeq: 9,
  windowVersion: 2,
  hasMoreBefore: false,
  hasMoreAfter: false,
  hiddenRunsBefore: null,
  firstUserThreadSeq: null,
};

function stateWith(events: SessionEvent[]): SessionStoreState {
  const keys: Record<string, number> = {};
  const sentSkills: Record<string, string[]> = {};
  for (const event of events) {
    const clientEventId = 'clientEventId' in event ? event.clientEventId : undefined;
    if (clientEventId === undefined) {
      continue;
    }
    keys[`ce:${clientEventId}`] = 1;
    sentSkills[`ce:${clientEventId}`] = ['skill'];
  }
  return {
    events: { t1: events },
    feeds: {},
    viewedSeq: {},
    seenAt: { t1: keys },
    seqCeil: {},
    activeRuns: {},
    failures: [],
    contentEpoch: {},
    sentSkills,
    history: { t1: { ...WINDOW } },
    touchedAt: {},
    mountedThreads: [],
    focusedThreadId: null,
  };
}

describe('dropDeletedEvents', () => {
  test('an open-ended range drops the events from the given seq onwards', () => {
    const state = stateWith([userEvent(4, 'a'), userEvent(5, 'b'), userEvent(9, 'c')]);
    const next = dropDeletedEvents(state, 't1', [{ from: 5, to: 0 }]);
    expect(next.events.t1?.map((event) => event.threadSeq)).toEqual([4]);
    expect(next.seenAt.t1).toEqual({ 'ce:a': 1 });
    expect(next.sentSkills).toEqual({ 'ce:a': ['skill'] });
    expect(next.history.t1?.windowVersion).toBe(WINDOW.windowVersion + 1);
  });

  test('a closed range drops exactly the events inside it', () => {
    const state = stateWith([userEvent(4, 'a'), userEvent(7, 'b'), userEvent(9, 'c')]);
    const next = dropDeletedEvents(state, 't1', [{ from: 7, to: 7 }]);
    expect(next.events.t1?.map((event) => event.threadSeq)).toEqual([4, 9]);
    expect(next.history.t1?.windowVersion).toBe(WINDOW.windowVersion + 1);
  });

  test('a range entirely below the loaded window drops nothing', () => {
    const state = stateWith([userEvent(4, 'a'), userEvent(9, 'c')]);
    const next = dropDeletedEvents(state, 't1', [{ from: 1, to: 3 }]);
    expect(next).toBe(state);
  });

  test('a thread without a loaded log is left untouched', () => {
    const state = stateWith([]);
    const next = dropDeletedEvents(state, 't1', [{ from: 1, to: 0 }]);
    expect(next).toBe(state);
  });
});
