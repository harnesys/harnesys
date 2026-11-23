import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { syncRunStateFromThread } from '@/features/send-message/model/sync-run-state';
import { getThreadHistory, getThreadSummary, syncThreadEvents } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

const inflight = new Map<string, Promise<boolean>>();

export interface RefreshThreadOptions {
  force?: boolean;
  tail?: boolean;
  aroundThreadSeq?: number;
}

export function refreshThread(threadId: string, options?: RefreshThreadOptions): Promise<boolean> {
  if (!options?.force && useSessionStore.getState().activeRuns[threadId]) {
    return Promise.resolve(false);
  }
  const running = inflight.get(threadId);
  if (running) {
    return running;
  }
  const task = runRefresh(threadId, options).finally(() => {
    if (inflight.get(threadId) === task) {
      inflight.delete(threadId);
    }
  });
  inflight.set(threadId, task);
  return task;
}

async function loadHistoryPage(threadId: string, aroundThreadSeq?: number): Promise<boolean> {
  const expectVersionBefore = useSessionStore.getState().history[threadId]?.windowVersion ?? null;
  const requestedAt = performance.now();
  const page = await getThreadHistory(
    threadId,
    aroundThreadSeq === undefined ? undefined : { aroundThreadSeq },
  );
  const fetchedAt = performance.now();
  if (aroundThreadSeq !== undefined) {
    useSessionStore.getState().dropThreadLog(threadId);
  }
  const expectVersion = aroundThreadSeq === undefined ? expectVersionBefore : null;
  syncRunStateFromThread(page.summary.id, page.summary.activeRun ?? null);
  const applied = useSessionStore.getState().applyHistoryPage(threadId, page, { expectVersion });
  trace('history', 'cold page', {
    threadId,
    kind: page.kind,
    aroundThreadSeq,
    events: page.events.length,
    fetchMs: Math.round(fetchedAt - requestedAt),
    applyMs: Math.round(performance.now() - fetchedAt),
    applied,
  });
  return applied;
}

async function runRefresh(threadId: string, options?: RefreshThreadOptions): Promise<boolean> {
  const session = useSessionStore.getState();
  const window = session.history[threadId];
  const thread = useThreadStore.getState().byId(threadId);
  if (
    options?.tail ||
    options?.aroundThreadSeq !== undefined ||
    window === undefined ||
    thread?.parentThreadId
  ) {
    await loadHistoryPage(threadId, options?.aroundThreadSeq);
    return true;
  }
  const expectVersion = window.windowVersion;
  let cursor = window.maxThreadSeq;
  for (;;) {
    const requestedAt = performance.now();
    const response = await syncThreadEvents(threadId, cursor);
    const fetchedAt = performance.now();
    syncRunStateFromThread(response.summary.id, response.summary.activeRun ?? null);
    const applied = useSessionStore.getState().applyThreadSync(threadId, response, expectVersion);
    trace('history', 'sync', {
      threadId,
      afterThreadSeq: cursor,
      events: response.events.length,
      hasMore: response.hasMore,
      applied,
      fetchMs: Math.round(fetchedAt - requestedAt),
      applyMs: Math.round(performance.now() - fetchedAt),
    });
    if (applied === 'stale') {
      return false;
    }
    if (applied === 'reload') {
      await loadHistoryPage(threadId);
      return true;
    }
    if (!response.hasMore || response.cursor <= cursor) {
      return true;
    }
    cursor = response.cursor;
  }
}

export async function ensureThreadCached(threadId: string): Promise<boolean> {
  if (useThreadStore.getState().byId(threadId)) {
    return true;
  }
  try {
    const summary = await getThreadSummary(threadId);
    useThreadStore.getState().upsert(toClientThread(summary));
    syncRunStateFromThread(summary.id, summary.activeRun ?? null);
    return true;
  } catch {
    return false;
  }
}
