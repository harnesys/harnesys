import type { ThreadHistoryPage, ThreadLogDeletion, ThreadSyncResponse } from '@harnesys/contracts';
import type { SessionEvent } from '@harnesys/studio-shared';
import type { ThreadFeed } from './feed/feed-types';

export const EMPTY_EVENTS: SessionEvent[] = [];
export const HISTORY_EVENTS_BUDGET = 50_000;

export const TERMINAL_EVENT_TYPES = new Set([
  'done',
  'error',
  'run.completed',
  'run.failed',
  'run.cancelled',
]);

export type ThreadHistoryMap = Record<string, ThreadHistoryWindow>;

export interface ActiveRun {
  runId: string;
  controller: AbortController;
}
export interface RunFailure {
  id: string;
  threadId: string;
  text: string;
}
export interface ThreadHistoryWindow {
  minThreadSeq: number;
  maxThreadSeq: number;
  windowVersion: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  hiddenRunsBefore: number | null;
  firstUserThreadSeq: number | null;
}
export interface ThreadLogSnapshot {
  events: SessionEvent[];
}
export interface HistoryApplyOptions {
  expectVersion?: number | null;
  rangeFrom?: number;
  rangeTo?: number;
}
export interface SessionStoreState {
  events: Record<string, SessionEvent[]>;
  feeds: Record<string, ThreadFeed>;
  viewedSeq: Record<string, number>;
  seenAt: Record<string, Record<string, number>>;
  seqCeil: Record<string, Record<string, number>>;
  activeRuns: Record<string, ActiveRun>;
  failures: RunFailure[];
  contentEpoch: Record<string, number>;
  sentSkills: Record<string, string[]>;
  history: ThreadHistoryMap;
  touchedAt: Record<string, number>;
  mountedThreads: string[];
  focusedThreadId: string | null;
}
export interface SessionStoreActions {
  eventsOf: (threadId: string) => SessionEvent[];
  replaceEvents: (threadId: string, events: SessionEvent[]) => void;
  applyFullSnapshot: (threadId: string, record: ThreadLogSnapshot) => void;
  applyThreadSync: (
    threadId: string,
    response: ThreadSyncResponse,
    expectVersion?: number | null,
  ) => 'applied' | 'reload' | 'stale';
  applyHistoryPage: (
    threadId: string,
    page: ThreadHistoryPage,
    options?: HistoryApplyOptions,
  ) => boolean;
  applyDeletions: (threadId: string, deletions: ThreadLogDeletion[]) => boolean;
  dropThreadLog: (threadId: string) => void;
  dropThreadHistory: (threadId: string) => void;
  markTouched: (threadId: string) => void;
  touchHistory: (threadId: string) => void;
  trimHistoryCache: () => void;
  setMountedThreads: (threadIds: string[]) => void;
  setFocusedThread: (threadId: string | null) => void;
  removeEventAt: (threadId: string, threadSeq: number) => boolean;
  truncateFrom: (threadId: string, threadSeq: number) => boolean;
  setHistoryCursor: (threadId: string, cursor: number) => void;
  appendEvent: (threadId: string, event: SessionEvent) => void;
  removeEventByClientEventId: (threadId: string, clientEventId: string) => void;
  setEventThreadSeq: (threadId: string, clientEventId: string, threadSeq: number) => void;
  setSentSkills: (threadId: string, clientEventId: string, skills: string[]) => void;
  sentSkillsFor: (clientEventId: string) => string[] | undefined;
  dismissFailure: (threadId: string, id: string) => void;
  startRun: (threadId: string, controller: AbortController, runId?: string) => void;
  finishRun: (threadId: string, runId?: string) => void;
  abortRun: (threadId: string) => void;
  setRunId: (threadId: string, runId: string) => void;
  runIdOf: (threadId: string) => string | undefined;
  isStreaming: (threadId: string) => boolean;
  setFailure: (failure: RunFailure) => void;
  removeForThreads: (threadIds: string[]) => void;
  refreshThreadFeed: (threadId: string) => void;
  hydrateViewedSeq: (threadId: string) => void;
  markViewed: (threadId: string, seq: number) => void;
}
