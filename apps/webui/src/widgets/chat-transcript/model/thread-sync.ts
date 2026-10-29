import type { ThreadRecord } from '@harnesys/studio-shared';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { refreshThread, useDeskStore } from '@/features/desk';
import { connectThreadRun } from '@/features/send-message';
import { useIsRemoteProject } from '@/shared/api';

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled', 'dead_lettered']);
export function useSyncedThread(threadId: string | null, orgId: string): boolean {
  const hasEvents = useSessionStore((state) => (threadId ? threadId in state.events : false));
  const hydrated = useDeskStore((state) => state.hydrated[orgId] === 'ready');
  const liveRunId = useThreadStore((state) =>
    threadId ? (state.items.find((item) => item.id === threadId)?.activeRunId ?? null) : null,
  );
  const remote = useIsRemoteProject(orgId);
  const streaming = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    setFetched(false);
  }, []);
  useEffect(() => {
    if (!threadId) {
      return;
    }
    if (hasEvents) {
      if (liveRunId && !streaming) {
        if (remote) {
          const store = useSessionStore.getState();
          if (!store.activeRuns[threadId]) {
            store.startRun(threadId, new AbortController(), liveRunId);
          }
        } else {
          void refreshThread(threadId)
            .then((record) => connectLiveRun(record, remote))
            .catch(() => {});
        }
      }
      return;
    }
    if (!hydrated) {
      return;
    }
    let cancelled = false;
    void refreshThread(threadId)
      .then((record) => {
        if (cancelled) {
          return;
        }
        connectLiveRun(record, remote);
        setFetched(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFetched(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, hasEvents, hydrated, liveRunId, streaming, remote]);
  return hasEvents || fetched;
}
function connectLiveRun(record: ThreadRecord | null, remote: boolean): void {
  if (!record) {
    return;
  }
  const active = record.activeRun;
  if (!active || TERMINAL_RUN_STATUSES.has(active.status)) {
    return;
  }
  if (remote) {
    const store = useSessionStore.getState();
    if (!store.activeRuns[record.id]) {
      store.startRun(record.id, new AbortController(), active.runId);
    }
    return;
  }
  connectThreadRun(record.id, active.runId);
}
