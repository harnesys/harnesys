import { useSessionStore } from '@/entities/session';
import { syncRunStateFromThread } from '@/features/send-message/model/sync-run-state';
import { getThreadHistory } from '@/shared/api';
import { trace } from '@/shared/lib/trace';

const inflight = new Set<string>();

export function loadEarlier(threadId: string): Promise<boolean> {
  const window = useSessionStore.getState().history[threadId];
  if (window === undefined || !window.hasMoreBefore || inflight.has(threadId)) {
    return Promise.resolve(false);
  }
  inflight.add(threadId);
  return fetchBefore(threadId, window.minThreadSeq, window.windowVersion).finally(() => {
    inflight.delete(threadId);
  });
}

async function fetchBefore(
  threadId: string,
  beforeThreadSeq: number,
  expectVersion: number,
): Promise<boolean> {
  const requestedAt = performance.now();
  const page = await getThreadHistory(threadId, { beforeThreadSeq });
  const fetchedAt = performance.now();
  syncRunStateFromThread(page.summary.id, page.summary.activeRun ?? null);
  const applied = useSessionStore.getState().applyHistoryPage(threadId, page, { expectVersion });
  trace('history', 'load earlier', {
    threadId,
    beforeThreadSeq,
    events: page.events.length,
    fetchMs: Math.round(fetchedAt - requestedAt),
    applyMs: Math.round(performance.now() - fetchedAt),
    applied,
  });
  return applied;
}
