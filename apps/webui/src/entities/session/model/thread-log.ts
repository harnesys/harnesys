import type { ThreadHistoryPage, ThreadSyncResponse } from '@harnesys/contracts';
import type { SessionEvent } from '@harnesys/studio-shared';
import type { ThreadSeqBounds } from './apply-deletions';
import { dropDeletedEvents, threadSeqBounds, withoutSentSkills } from './apply-deletions';
import { ceilFromEvents, fillSeenAt, stableKeys } from './event-keys';
import { feedUpdate } from './feed/feed-engine';
import { applyStableLog, applyTailAppend } from './incremental-log';
import { normalizeThreadEvents } from './normalize-events';
import { takePending } from './pending-appends';
import { mergeSeqCeil, reconcileSnapshot, sameThreadLog } from './reconcile-snapshot';
import { applyBatches } from './session-batches';
import {
  EMPTY_EVENTS,
  HISTORY_EVENTS_BUDGET,
  type HistoryApplyOptions,
  type SessionStoreState,
  type ThreadHistoryWindow,
  type ThreadLogSnapshot,
} from './session-types';
import { withoutThreads } from './without-threads';

export interface HistoryTrimResult {
  state: SessionStoreState;
  evicted: string | undefined;
}

const NO_THREAD_SEQ = Number.MAX_SAFE_INTEGER;

function byThreadSeq(left: SessionEvent, right: SessionEvent): number {
  return (left.threadSeq ?? NO_THREAD_SEQ) - (right.threadSeq ?? NO_THREAD_SEQ);
}

function dedupeBySeq(events: SessionEvent[]): SessionEvent[] {
  const seen = new Set<number>();
  const out: SessionEvent[] = [];
  for (const event of events) {
    const seq = event.threadSeq;
    if (seq === undefined) {
      out.push(event);
      continue;
    }
    if (seen.has(seq)) {
      continue;
    }
    seen.add(seq);
    out.push(event);
  }
  return out;
}

export function clearThreadLog(state: SessionStoreState, threadId: string): SessionStoreState {
  return {
    ...state,
    events: withoutThreads(state.events, [threadId]),
    feeds: withoutThreads(state.feeds, [threadId]),
    seqCeil: withoutThreads(state.seqCeil, [threadId]),
    history: withoutThreads(state.history, [threadId]),
    contentEpoch: withoutThreads(state.contentEpoch, [threadId]),
    sentSkills: withoutSentSkills(state.sentSkills, state.events[threadId] ?? EMPTY_EVENTS),
  };
}

function installWindow(
  state: SessionStoreState,
  threadId: string,
  events: SessionEvent[],
  window: ThreadHistoryWindow,
  seqCeil?: Record<string, number>,
): SessionStoreState {
  const now = Date.now();
  const seenAt = fillSeenAt(state.seenAt, threadId, stableKeys(events), now);
  return {
    ...state,
    events: { ...state.events, [threadId]: events },
    feeds: {
      ...state.feeds,
      [threadId]: feedUpdate(threadId, events, seenAt[threadId] ?? {}, null),
    },
    seenAt,
    seqCeil: seqCeil === undefined ? state.seqCeil : { ...state.seqCeil, [threadId]: seqCeil },
    contentEpoch: { ...state.contentEpoch, [threadId]: now },
    history: { ...state.history, [threadId]: window },
    touchedAt: { ...state.touchedAt, [threadId]: now },
  };
}

export function installFullSnapshot(
  state: SessionStoreState,
  threadId: string,
  snapshot: ThreadLogSnapshot,
): SessionStoreState {
  const coalesced = normalizeThreadEvents(snapshot.events);
  const bounds = threadSeqBounds(coalesced);
  const previous = state.history[threadId];
  return installWindow(
    state,
    threadId,
    coalesced,
    {
      minThreadSeq: bounds.min,
      maxThreadSeq: bounds.max,
      windowVersion: previous === undefined ? 0 : previous.windowVersion + 1,
      hasMoreBefore: false,
      hasMoreAfter: false,
      hiddenRunsBefore: null,
      firstUserThreadSeq: null,
    },
    ceilFromEvents(coalesced),
  );
}

function applyTailPage(
  state: SessionStoreState,
  threadId: string,
  page: ThreadHistoryPage,
  incoming: SessionEvent[],
): SessionStoreState {
  const previous = state.history[threadId];
  const windowOf = (bounds: ThreadSeqBounds): ThreadHistoryWindow => ({
    minThreadSeq: page.minThreadSeq,
    maxThreadSeq: Math.max(page.maxThreadSeq, bounds.max),
    windowVersion: previous === undefined ? 0 : previous.windowVersion + 1,
    hasMoreBefore: page.hasMoreBefore,
    hasMoreAfter: page.hasMoreAfter,
    hiddenRunsBefore: page.hiddenRunsBefore,
    firstUserThreadSeq: page.firstUserThreadSeq,
  });
  const local = state.events[threadId] ?? EMPTY_EVENTS;
  const kept = local.filter(
    (event) => event.threadSeq === undefined || event.threadSeq >= page.minThreadSeq,
  );
  const merged = normalizeThreadEvents(
    reconcileSnapshot(kept, incoming, { windowStart: page.minThreadSeq }),
  );
  return installWindow(
    state,
    threadId,
    merged,
    windowOf(threadSeqBounds(merged)),
    ceilFromEvents(merged),
  );
}

function applyBeforePage(
  state: SessionStoreState,
  threadId: string,
  page: ThreadHistoryPage,
  incoming: SessionEvent[],
): SessionStoreState {
  const window = state.history[threadId];
  if (window === undefined) {
    return state;
  }
  if (incoming.length === 0) {
    if (!window.hasMoreBefore) {
      return state;
    }
    return {
      ...state,
      history: { ...state.history, [threadId]: { ...window, hasMoreBefore: false } },
    };
  }
  const current = state.events[threadId] ?? EMPTY_EVENTS;
  const merged = normalizeThreadEvents(dedupeBySeq([...incoming, ...current]).sort(byThreadSeq));
  return installWindow(state, threadId, merged, {
    ...window,
    minThreadSeq: page.minThreadSeq,
    hasMoreBefore: page.hasMoreBefore,
    hiddenRunsBefore: page.hiddenRunsBefore,
  });
}

function applyRangePage(
  state: SessionStoreState,
  threadId: string,
  incoming: SessionEvent[],
  options?: HistoryApplyOptions,
): SessionStoreState {
  const window = state.history[threadId];
  if (window === undefined) {
    return state;
  }
  const from = options?.rangeFrom ?? window.minThreadSeq;
  const to = options?.rangeTo ?? window.maxThreadSeq;
  const windowOf = (bounds: ThreadSeqBounds): ThreadHistoryWindow => ({
    ...window,
    minThreadSeq:
      bounds.max === 0 ? window.minThreadSeq : Math.min(window.minThreadSeq, bounds.min),
    maxThreadSeq:
      bounds.max === 0 ? window.maxThreadSeq : Math.max(window.maxThreadSeq, bounds.max),
  });
  const appended = applyTailAppend({
    state,
    threadId,
    incoming,
    keepLocalBelow: from,
    rejectDuplicateSeq: true,
    windowOf,
    seqCeil: mergeSeqCeil(state.seqCeil[threadId] ?? {}, incoming),
  });
  if (appended !== null) {
    return appended;
  }
  const current = state.events[threadId] ?? EMPTY_EVENTS;
  const kept = current.filter(
    (event) => event.threadSeq === undefined || event.threadSeq < from || event.threadSeq > to,
  );
  const merged = normalizeThreadEvents(dedupeBySeq([...incoming, ...kept]).sort(byThreadSeq));
  return installWindow(
    state,
    threadId,
    merged,
    windowOf(threadSeqBounds(merged)),
    mergeSeqCeil(state.seqCeil[threadId] ?? {}, incoming),
  );
}

export function applyHistoryPage(
  state: SessionStoreState,
  threadId: string,
  page: ThreadHistoryPage,
  options?: HistoryApplyOptions,
): SessionStoreState {
  const incoming = page.events as SessionEvent[];
  const base = applyBatches(state, takePending());
  switch (page.kind) {
    case 'tail':
      return applyTailPage(base, threadId, page, incoming);
    case 'before':
      return applyBeforePage(base, threadId, page, incoming);
    case 'range':
      return applyRangePage(base, threadId, incoming, options);
  }
}

export function applySyncResponse(
  state: SessionStoreState,
  threadId: string,
  response: ThreadSyncResponse,
  cursorBefore: number,
): SessionStoreState {
  const incoming = response.events as SessionEvent[];
  const flushed = applyBatches(
    dropDeletedEvents(state, threadId, response.deletions),
    takePending(),
  );
  const window = flushed.history[threadId];
  const nextWindow =
    window === undefined
      ? undefined
      : {
          ...window,
          maxThreadSeq: Math.max(window.maxThreadSeq, response.cursor),
          hasMoreAfter: response.hasMore ? window.hasMoreAfter : false,
        };
  if (nextWindow !== undefined) {
    const fast =
      incoming.length === 0
        ? applyStableLog({ state: flushed, threadId, windowOf: () => nextWindow })
        : applyTailAppend({
            state: flushed,
            threadId,
            incoming,
            windowOf: () => nextWindow,
            keepLocalBelow: cursorBefore + 1,
            seqCeil: mergeSeqCeil(flushed.seqCeil[threadId] ?? {}, incoming),
          });
    if (fast !== null) {
      return fast;
    }
  }
  const current = flushed.events[threadId] ?? EMPTY_EVENTS;
  const merged = normalizeThreadEvents(
    reconcileSnapshot(current, incoming, { windowStart: cursorBefore + 1 }),
  );
  const unchanged = sameThreadLog(current, merged);
  const now = Date.now();
  const seenAt = fillSeenAt(flushed.seenAt, threadId, stableKeys(merged), now);
  return {
    ...flushed,
    events: unchanged ? flushed.events : { ...flushed.events, [threadId]: merged },
    feeds: unchanged
      ? flushed.feeds
      : {
          ...flushed.feeds,
          [threadId]: feedUpdate(threadId, merged, seenAt[threadId] ?? {}, null),
        },
    seenAt,
    seqCeil: {
      ...flushed.seqCeil,
      [threadId]: mergeSeqCeil(flushed.seqCeil[threadId] ?? {}, incoming),
    },
    contentEpoch: unchanged ? flushed.contentEpoch : { ...flushed.contentEpoch, [threadId]: now },
    history:
      nextWindow === undefined ? flushed.history : { ...flushed.history, [threadId]: nextWindow },
    touchedAt: { ...flushed.touchedAt, [threadId]: now },
  };
}

export function dropThreadHistory(state: SessionStoreState, threadId: string): SessionStoreState {
  const cleared = clearThreadLog(state, threadId);
  if (cleared.touchedAt[threadId] === undefined) {
    return cleared;
  }
  const touchedAt = { ...cleared.touchedAt };
  delete touchedAt[threadId];
  return { ...cleared, touchedAt };
}

export function historyEventCount(state: SessionStoreState): number {
  let total = 0;
  for (const threadId of Object.keys(state.history)) {
    total += state.events[threadId]?.length ?? 0;
  }
  return total;
}

export function trimHistoryCache(
  state: SessionStoreState,
  protectedThreadIds: readonly string[],
): HistoryTrimResult {
  if (historyEventCount(state) <= HISTORY_EVENTS_BUDGET) {
    return { state, evicted: undefined };
  }
  const blocked = new Set(protectedThreadIds);
  const oldestFirst = Object.entries(state.touchedAt).sort(([, left], [, right]) => left - right);
  for (const [threadId] of oldestFirst) {
    if (blocked.has(threadId)) {
      continue;
    }
    if (state.history[threadId] === undefined && state.events[threadId] === undefined) {
      continue;
    }
    return { state: dropThreadHistory(state, threadId), evicted: threadId };
  }
  return { state, evicted: undefined };
}
