import { create } from 'zustand';
import { dropDeletedEvents, withoutSentSkills } from './apply-deletions';
import { isToolInputStream } from './coalesce-events';
import { eventKey, withThreadSeq } from './event-keys';
import { feedDrop, feedUpdate } from './feed/feed-engine';
import { createHistoryActions } from './history-actions';
import { clearLiveTail, clearLiveTails, ingestLiveDelta, sealLiveTail } from './live-tail';
import {
  cancelEpochFlush,
  dropPendingThreads,
  enqueuePending,
  hasPending,
  scheduleEpochFlush,
  takePending,
} from './pending-appends';
import { applyBatches, isStreamDeltaType } from './session-batches';
import { EMPTY_EVENTS, type SessionStoreActions, type SessionStoreState } from './session-types';
import { clearThreadLog, installFullSnapshot } from './thread-log';
import { withoutThreads } from './without-threads';

export type {
  ActiveRun,
  HistoryApplyOptions,
  RunFailure,
  ThreadHistoryWindow,
  ThreadLogSnapshot,
} from './session-types';

const EPOCH_DELTA_MS = 400;

export const useSessionStore = create<SessionStoreState & SessionStoreActions>((set, get, api) => {
  const flushPending = () => {
    cancelEpochFlush();
    if (!hasPending()) {
      return;
    }
    set((state) => applyBatches(state, takePending()));
  };
  return {
    ...createHistoryActions(api),
    events: {},
    feeds: {},
    viewedSeq: {},
    seenAt: {},
    seqCeil: {},
    activeRuns: {},
    failures: [],
    contentEpoch: {},
    sentSkills: {},
    history: {},
    touchedAt: {},
    mountedThreads: [],
    focusedThreadId: null,
    eventsOf(threadId: string) {
      return get().events[threadId] ?? EMPTY_EVENTS;
    },
    replaceEvents(threadId, events) {
      get().applyFullSnapshot(threadId, { events });
    },
    applyFullSnapshot(threadId, record) {
      clearLiveTail(threadId);
      dropPendingThreads([threadId]);
      set((state) => installFullSnapshot(applyBatches(state, takePending()), threadId, record));
      get().trimHistoryCache();
    },
    applyDeletions(threadId, deletions) {
      const state = get();
      const next = dropDeletedEvents(state, threadId, deletions);
      if (next === state) {
        return false;
      }
      set(next);
      return true;
    },
    dropThreadLog(threadId) {
      dropPendingThreads([threadId]);
      clearLiveTail(threadId);
      feedDrop([threadId]);
      set((state) => clearThreadLog(state, threadId));
    },
    removeEventAt(threadId, threadSeq) {
      return get().applyDeletions(threadId, [{ from: threadSeq, to: threadSeq }]);
    },
    truncateFrom(threadId, threadSeq) {
      return get().applyDeletions(threadId, [{ from: threadSeq, to: 0 }]);
    },
    setHistoryCursor(threadId, cursor) {
      set((state) => {
        const window = state.history[threadId];
        if (window === undefined || window.maxThreadSeq === cursor) {
          return state;
        }
        return {
          ...state,
          history: { ...state.history, [threadId]: { ...window, maxThreadSeq: cursor } },
        };
      });
    },
    appendEvent(threadId, event) {
      if (isStreamDeltaType(event.type)) {
        const phase = ingestLiveDelta(threadId, event);
        enqueuePending(threadId, event);
        if (phase === 'open') {
          flushPending();
          return;
        }
        scheduleEpochFlush(flushPending, EPOCH_DELTA_MS);
        return;
      }
      if (isToolInputStream(event)) {
        enqueuePending(threadId, event);
        if (!event.delta) {
          flushPending();
          return;
        }
        scheduleEpochFlush(flushPending, EPOCH_DELTA_MS);
        return;
      }
      sealLiveTail(threadId);
      enqueuePending(threadId, event);
      flushPending();
    },
    removeEventByClientEventId(threadId, clientEventId) {
      set((state) => {
        const base = applyBatches(state, takePending());
        const current = base.events[threadId];
        if (current === undefined) {
          return base;
        }
        const key = `ce:${clientEventId}`;
        const next = current.filter((ev) => eventKey(ev) !== key);
        if (next.length === current.length) {
          return base;
        }
        const { [key]: _gone, ...sentSkills } = base.sentSkills;
        const stripped = {
          ...base,
          events: { ...base.events, [threadId]: next },
          feeds: {
            ...base.feeds,
            [threadId]: feedUpdate(threadId, next, base.seenAt[threadId] ?? {}, null),
          },
          sentSkills,
          contentEpoch: { ...base.contentEpoch, [threadId]: Date.now() },
        };
        const threadSeen = base.seenAt[threadId];
        if (threadSeen?.[key] === undefined) {
          return stripped;
        }
        const { [key]: _removed, ...restSeen } = threadSeen;
        return { ...stripped, seenAt: { ...base.seenAt, [threadId]: restSeen } };
      });
    },
    setEventThreadSeq(threadId, clientEventId, threadSeq) {
      set((state) => {
        const base = applyBatches(state, takePending());
        const next = withThreadSeq(base.events[threadId] ?? EMPTY_EVENTS, clientEventId, threadSeq);
        if (next === null) {
          return base;
        }
        const seen = base.seenAt[threadId] ?? {};
        return {
          ...base,
          events: { ...base.events, [threadId]: next },
          feeds: { ...base.feeds, [threadId]: feedUpdate(threadId, next, seen, null) },
          contentEpoch: { ...base.contentEpoch, [threadId]: Date.now() },
        };
      });
    },
    setSentSkills(_threadId, clientEventId, skills) {
      set((state) => ({ sentSkills: { ...state.sentSkills, [`ce:${clientEventId}`]: skills } }));
    },
    sentSkillsFor: (clientEventId) => get().sentSkills[`ce:${clientEventId}`],
    startRun(threadId, controller, runId) {
      set((state) => ({
        activeRuns: {
          ...state.activeRuns,
          [threadId]: { runId: runId ?? '', controller },
        },
      }));
    },
    finishRun(threadId, runId) {
      clearLiveTail(threadId);
      set((state) => {
        const active = state.activeRuns[threadId];
        if (!active) {
          return state;
        }
        if (runId && active.runId && active.runId !== runId) {
          return state;
        }
        const { [threadId]: _, ...rest } = state.activeRuns;
        return { activeRuns: rest };
      });
    },
    abortRun(threadId) {
      const active = get().activeRuns[threadId];
      if (active) {
        active.controller.abort();
      }
      set((state) => {
        const { [threadId]: _, ...rest } = state.activeRuns;
        return { activeRuns: rest };
      });
    },
    setRunId(threadId, runId) {
      set((state) => {
        const active = state.activeRuns[threadId];
        if (!active) {
          return state;
        }
        return {
          activeRuns: {
            ...state.activeRuns,
            [threadId]: { ...active, runId },
          },
        };
      });
    },
    runIdOf(threadId) {
      return get().activeRuns[threadId]?.runId;
    },
    isStreaming(threadId) {
      return Boolean(get().activeRuns[threadId]);
    },
    setFailure(failure) {
      set((state) => ({
        failures: [...state.failures.filter((item) => item.id !== failure.id), failure],
      }));
    },
    dismissFailure(threadId, id) {
      set((state) => ({
        failures: state.failures.filter((item) => !(item.threadId === threadId && item.id === id)),
      }));
    },
    removeForThreads(threadIds) {
      dropPendingThreads(threadIds);
      clearLiveTails(threadIds);
      feedDrop(threadIds);
      set((state) => {
        const base = applyBatches(state, takePending());
        const removed = threadIds.flatMap((id) => base.events[id] ?? []);
        return {
          ...base,
          events: withoutThreads(base.events, threadIds),
          feeds: withoutThreads(base.feeds, threadIds),
          seenAt: withoutThreads(base.seenAt, threadIds),
          seqCeil: withoutThreads(base.seqCeil, threadIds),
          activeRuns: withoutThreads(base.activeRuns, threadIds),
          contentEpoch: withoutThreads(base.contentEpoch, threadIds),
          history: withoutThreads(base.history, threadIds),
          viewedSeq: withoutThreads(base.viewedSeq, threadIds),
          touchedAt: withoutThreads(base.touchedAt, threadIds),
          sentSkills: withoutSentSkills(base.sentSkills, removed),
        };
      });
    },
    refreshThreadFeed(threadId) {
      const state = get();
      const events = state.events[threadId];
      if (!events) {
        return;
      }
      set((current) => ({
        feeds: {
          ...current.feeds,
          [threadId]: feedUpdate(threadId, events, current.seenAt[threadId] ?? {}, null),
        },
      }));
    },
  };
});
