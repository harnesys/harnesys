import type { RefObject } from 'react';
import { useEffect } from 'react';
import type { FeedRun } from '@/entities/session';
import { useSessionStore } from '@/entities/session';
import { refreshThread } from '@/features/desk';
import { onMessageJumpRequest, requestMessageJump } from '@/features/message-quote';
import { runIndexForSeq } from './run-index-for-seq';

export interface MessageJumpWindow {
  reveal: (index: number) => void;
}

export function useMessageJump(
  threadId: string,
  active: boolean,
  runs: FeedRun[],
  window: MessageJumpWindow,
  panel: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    return onMessageJumpRequest((targetThreadId, threadSeq) => {
      if (targetThreadId !== threadId) {
        return;
      }
      if (!windowCoversSeq(threadId, threadSeq)) {
        void refreshThread(threadId, { force: true, aroundThreadSeq: threadSeq })
          .then(() => {
            if (windowCoversSeq(threadId, threadSeq)) {
              requestMessageJump(threadId, threadSeq);
            }
          })
          .catch(() => {});
        return;
      }
      const index = runIndexForSeq(runs, threadSeq);
      if (index >= 0) {
        window.reveal(index);
      }
      scrollToSeq(threadSeq, panel.current);
    });
  }, [active, threadId, window, runs, panel]);
}

function windowCoversSeq(threadId: string, threadSeq: number): boolean {
  const window = useSessionStore.getState().history[threadId];
  return (
    window !== undefined && threadSeq >= window.minThreadSeq && threadSeq <= window.maxThreadSeq
  );
}

function scrollToSeq(threadSeq: number, panel: HTMLElement | null): void {
  const root = panel ?? document;
  const node = root.querySelector<HTMLElement>(`[data-thread-seq="${threadSeq}"]`);
  if (!node) {
    return;
  }
  scrollNodeIntoView(node);
}

function scrollNodeIntoView(node: HTMLElement): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  node.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  if (reduced) {
    return;
  }
  node.animate(
    [
      { backgroundColor: 'transparent' },
      { backgroundColor: 'color-mix(in oklab, var(--color-live) 18%, transparent)' },
      { backgroundColor: 'transparent' },
    ],
    { duration: 1200, easing: 'ease-out' },
  );
}
