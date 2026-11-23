import type { UIEvent } from 'react';
import { useRef } from 'react';
import { useSessionStore } from '@/entities/session';
import { loadEarlier } from '@/features/desk';

const PREFETCH_DISTANCE_PX = 600;

export function useLoadEarlierTrigger(threadId: string): (event: UIEvent<HTMLDivElement>) => void {
  const requestedMin = useRef<number | null>(null);
  return (event: UIEvent<HTMLDivElement>) => {
    if (event.currentTarget.scrollTop > PREFETCH_DISTANCE_PX) {
      return;
    }
    const window = useSessionStore.getState().history[threadId];
    if (window === undefined || !window.hasMoreBefore) {
      return;
    }
    if (requestedMin.current === window.minThreadSeq) {
      return;
    }
    requestedMin.current = window.minThreadSeq;
    void loadEarlier(threadId).catch(() => {
      requestedMin.current = null;
    });
  };
}
