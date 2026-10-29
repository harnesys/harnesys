import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/entities/session';
import { useThreadQueueStore } from './queue.store';

export function useThreadQueue(threadId: string | null) {
  const items = useThreadQueueStore((state) => (threadId ? state.items[threadId] : undefined));
  const streaming = useSessionStore((state) =>
    threadId ? Boolean(state.activeRuns[threadId]) : false,
  );
  const wasStreaming = useRef(streaming);
  useEffect(() => {
    if (threadId) {
      void useThreadQueueStore.getState().refresh(threadId);
    }
  }, [threadId]);
  useEffect(() => {
    const finished = wasStreaming.current && !streaming;
    wasStreaming.current = streaming;
    if (finished && threadId) {
      void useThreadQueueStore.getState().refresh(threadId);
    }
  }, [streaming, threadId]);
  return items ?? [];
}
