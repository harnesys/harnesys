import { useEffect, useState } from 'react';
import { useSessionStore } from '@/entities/session';
import { refreshThread, useDeskReady } from '@/features/desk';

export function useSyncedThread(threadId: string | null, orgId: string): boolean {
  const loaded = useSessionStore((state) => (threadId ? state.historyLoaded[threadId] : false));
  const hydrated = useDeskReady(orgId);
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    setFetched(false);
    if (!threadId) {
      return;
    }
    if (loaded) {
      return;
    }
    if (!hydrated) {
      return;
    }
    let cancelled = false;
    void refreshThread(threadId)
      .then(() => {
        if (cancelled) {
          return;
        }
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
  }, [threadId, loaded, hydrated]);
  return loaded || fetched;
}
