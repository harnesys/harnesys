import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useSessionStore } from '@/entities/session';
import { refreshThread, useDeskReady } from '@/features/desk';
import { AROUND_THREAD_SEQ_PARAM, parseAroundThreadSeq } from '@/shared/config/routes';

export function useSyncedThread(threadId: string | null, orgId: string): boolean {
  const loaded = useSessionStore((state) =>
    threadId ? state.history[threadId] !== undefined : false,
  );
  const hydrated = useDeskReady(orgId);
  const [searchParams] = useSearchParams();
  const aroundThreadSeq = parseAroundThreadSeq(searchParams.get(AROUND_THREAD_SEQ_PARAM));
  const [fetched, setFetched] = useState(false);
  const centered = useRef<string | null>(null);
  useEffect(() => {
    setFetched(false);
    if (!threadId) {
      return;
    }
    const centerKey = aroundThreadSeq === undefined ? null : `${threadId}:${aroundThreadSeq}`;
    const covered = aroundThreadSeq === undefined || windowCoversSeq(threadId, aroundThreadSeq);
    if (loaded && (centerKey === null || centered.current === centerKey || covered)) {
      if (centerKey !== null) {
        centered.current = centerKey;
      }
      return;
    }
    if (!hydrated) {
      return;
    }
    if (centerKey !== null) {
      centered.current = centerKey;
    }
    let cancelled = false;
    void refreshThread(
      threadId,
      aroundThreadSeq === undefined ? undefined : { force: true, aroundThreadSeq },
    )
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
  }, [threadId, loaded, hydrated, aroundThreadSeq]);
  return loaded || fetched;
}

function windowCoversSeq(threadId: string, threadSeq: number): boolean {
  const window = useSessionStore.getState().history[threadId];
  return (
    window !== undefined && threadSeq >= window.minThreadSeq && threadSeq <= window.maxThreadSeq
  );
}
