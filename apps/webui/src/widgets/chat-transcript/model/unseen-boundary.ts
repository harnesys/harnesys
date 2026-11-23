import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/entities/session';

export function useUnseenBoundary(
  threadId: string,
  active: boolean,
  unread: boolean,
  total: number,
): number | null {
  const viewedSeq = useSessionStore((state) => (active ? state.viewedSeq[threadId] : undefined));
  const hydrateViewedSeq = useSessionStore((state) => state.hydrateViewedSeq);
  const captured = useRef<{ threadId: string; show: boolean } | null>(null);
  useEffect(() => {
    if (!active) {
      captured.current = null;
      return;
    }
    if (total === 0 || captured.current?.threadId === threadId) {
      return;
    }
    hydrateViewedSeq(threadId);
    captured.current = { threadId, show: unread };
  }, [active, threadId, unread, total, hydrateViewedSeq]);
  if (!active || viewedSeq === undefined || !captured.current?.show) {
    return null;
  }
  return captured.current.threadId === threadId ? viewedSeq : null;
}
