import type { ThreadHistoryPage, ThreadSyncResponse } from '@harnesys/contracts';
import type { StoreApi } from 'zustand';
import { useThreadStore } from '@/entities/thread/model/thread.store';
import { toClientThread } from '@/entities/thread/model/thread-record';
import { toStudioSummary } from '@/shared/api/threads';
import { trace } from '@/shared/lib/trace';
import { feedDrop } from './feed/feed-engine';
import { clearLiveTail } from './live-tail';
import { dropPendingThreads } from './pending-appends';
import {
  HISTORY_EVENTS_BUDGET,
  type HistoryApplyOptions,
  type SessionStoreActions,
  type SessionStoreState,
  type ThreadHistoryWindow,
} from './session-types';
import {
  applyHistoryPage as applyPageState,
  applySyncResponse,
  dropThreadHistory as dropHistoryState,
  historyEventCount,
  trimHistoryCache as trimState,
} from './thread-log';

type SessionStore = SessionStoreState & SessionStoreActions;

type HistoryActionKey =
  | 'applyThreadSync'
  | 'applyHistoryPage'
  | 'dropThreadHistory'
  | 'markTouched'
  | 'touchHistory'
  | 'trimHistoryCache'
  | 'setMountedThreads'
  | 'setFocusedThread'
  | 'hydrateViewedSeq'
  | 'markViewed';

const VIEWED_SEQ_PREFIX = 'harnesys.viewed-seq.';
const LEGACY_VIEWED_PREFIX = 'harnesys.viewed.';

function readViewedSeq(threadId: string): number | null {
  try {
    localStorage.removeItem(LEGACY_VIEWED_PREFIX + threadId);
    const raw = localStorage.getItem(VIEWED_SEQ_PREFIX + threadId);
    if (raw === null) {
      return null;
    }
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function writeViewedSeq(threadId: string, seq: number): void {
  try {
    localStorage.removeItem(LEGACY_VIEWED_PREFIX + threadId);
    localStorage.setItem(VIEWED_SEQ_PREFIX + threadId, String(seq));
  } catch {}
}

function upsertSummary(response: ThreadSyncResponse | ThreadHistoryPage): void {
  useThreadStore.getState().upsert(toClientThread(toStudioSummary(response.summary)));
}

function matchesVersion(window: ThreadHistoryWindow | undefined, expect: number | null): boolean {
  if (expect === null) {
    return window === undefined;
  }
  return window !== undefined && window.windowVersion === expect;
}

function runningThreadIds(): string[] {
  return useThreadStore
    .getState()
    .items.filter((thread) => thread.activeRunId != null)
    .map((thread) => thread.id);
}

function protectedThreadIds(state: SessionStoreState): string[] {
  const ids = [...state.mountedThreads, ...Object.keys(state.activeRuns), ...runningThreadIds()];
  if (state.focusedThreadId !== null) {
    ids.push(state.focusedThreadId);
  }
  return ids;
}

function discardLog(threadId: string): void {
  dropPendingThreads([threadId]);
  clearLiveTail(threadId);
  feedDrop([threadId]);
}

export function createHistoryActions(
  api: StoreApi<SessionStore>,
): Pick<SessionStoreActions, HistoryActionKey> {
  return {
    applyThreadSync(threadId, response, expectVersion) {
      if (
        expectVersion !== undefined &&
        !matchesVersion(api.getState().history[threadId], expectVersion)
      ) {
        return 'stale';
      }
      const window = api.getState().history[threadId];
      if (window === undefined || response.reset) {
        api.getState().dropThreadLog(threadId);
        upsertSummary(response);
        return 'reload';
      }
      const cursorBefore = window.maxThreadSeq;
      api.setState((state) => applySyncResponse(state, threadId, response, cursorBefore));
      upsertSummary(response);
      api.getState().trimHistoryCache();
      return 'applied';
    },
    applyHistoryPage(threadId, page, options?: HistoryApplyOptions) {
      const expect = options?.expectVersion;
      if (expect !== undefined && !matchesVersion(api.getState().history[threadId], expect)) {
        return false;
      }
      api.setState((state) => applyPageState(state, threadId, page, options));
      upsertSummary(page);
      api.getState().trimHistoryCache();
      return true;
    },
    dropThreadHistory(threadId) {
      discardLog(threadId);
      api.setState((state) => dropHistoryState(state, threadId));
    },
    markTouched(threadId) {
      api.setState((state) => ({ touchedAt: { ...state.touchedAt, [threadId]: Date.now() } }));
    },
    touchHistory(threadId) {
      api.getState().markTouched(threadId);
      api.getState().trimHistoryCache();
    },
    trimHistoryCache() {
      const state = api.getState();
      const result = trimState(state, protectedThreadIds(state));
      if (result.evicted !== undefined) {
        discardLog(result.evicted);
        api.setState(result.state);
        return;
      }
      if (historyEventCount(state) > HISTORY_EVENTS_BUDGET) {
        trace('history', 'trim soft-stop', { threads: Object.keys(state.history).length });
      }
    },
    setMountedThreads(threadIds) {
      api.setState({ mountedThreads: threadIds });
    },
    setFocusedThread(threadId) {
      if (api.getState().focusedThreadId !== threadId) {
        api.setState({ focusedThreadId: threadId });
      }
    },
    hydrateViewedSeq(threadId) {
      if (api.getState().viewedSeq[threadId] !== undefined) {
        return;
      }
      const stored = readViewedSeq(threadId);
      if (stored === null) {
        return;
      }
      api.setState((state) => ({ viewedSeq: { ...state.viewedSeq, [threadId]: stored } }));
    },
    markViewed(threadId, seq) {
      if (!Number.isFinite(seq) || seq < 0 || api.getState().viewedSeq[threadId] === seq) {
        return;
      }
      writeViewedSeq(threadId, seq);
      api.setState((state) => ({ viewedSeq: { ...state.viewedSeq, [threadId]: seq } }));
    },
  };
}
