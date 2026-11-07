import type { ThreadRecord } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { syncRunStateFromThread } from '@/features/send-message/model/sync-run-state';
import { getThread } from '@/shared/api';

const inflight = new Map<string, Promise<ThreadRecord | null>>();
export function refreshThread(
  threadId: string,
  options?: { force?: boolean },
): Promise<ThreadRecord | null> {
  if (!options?.force && useSessionStore.getState().activeRuns[threadId]) {
    return Promise.resolve(null);
  }
  const running = inflight.get(threadId);
  if (running) {
    return running;
  }
  const task = getThread(threadId)
    .then((record) => {
      useThreadStore.getState().upsert(toClientThread(record));
      syncRunStateFromThread(record.id, record.activeRun ?? null);
      useSessionStore.getState().reconcileEvents(record.id, record.events);
      return record;
    })
    .finally(() => {
      if (inflight.get(threadId) === task) {
        inflight.delete(threadId);
      }
    });
  inflight.set(threadId, task);
  return task;
}
export async function ensureThreadCached(threadId: string): Promise<boolean> {
  if (useThreadStore.getState().byId(threadId)) {
    return true;
  }
  try {
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    return true;
  } catch {
    return false;
  }
}
