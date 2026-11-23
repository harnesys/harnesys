import { ArrowUpIcon } from 'lucide-react';
import { type MouseEvent, useEffect, useState } from 'react';
import { type FeedRun, useSessionStore } from '@/entities/session';
import { loadEarlier } from '@/features/desk';
import { Button } from '@/shared/ui/button';
import { MessageScrollerItem } from '@/shared/ui/message-scroller';
import { usePrependRestore } from '../model/use-prepend-restore';

export const TAIL_RUNS = 12;

export interface RenderWindow {
  size: number;
  offset: number;
  visible: FeedRun[];
  hiddenLoaded: number;
  hiddenTotal: number | null;
  canLoad: boolean;
  failed: boolean;
  loadMore: (event: MouseEvent<HTMLButtonElement>) => void;
  reveal: (runIndex: number) => void;
  reset: () => void;
}

export function useRenderWindow(threadId: string, runs: FeedRun[]): RenderWindow {
  const [state, setState] = useState({ threadId, size: TAIL_RUNS });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (state.threadId !== threadId) {
      setState({ threadId, size: TAIL_RUNS });
      setFailed(false);
    }
  }, [threadId, state.threadId]);
  const size = state.threadId === threadId ? state.size : TAIL_RUNS;
  const hiddenBefore = useSessionStore(
    (current) => current.history[threadId]?.hiddenRunsBefore ?? null,
  );
  const captureAnchor = usePrependRestore(size);
  const hiddenLoaded = Math.max(0, runs.length - size);
  const hiddenTotal = hiddenBefore === null ? null : hiddenLoaded + hiddenBefore;
  const canLoad = hiddenLoaded > 0 || (hiddenBefore !== null && hiddenBefore > 0);
  const loadMore = (event: MouseEvent<HTMLButtonElement>): void => {
    const target = event.currentTarget;
    const expandable = Math.min(runs.length, size + TAIL_RUNS);
    if (expandable > size) {
      setFailed(false);
      captureAnchor(target, expandable);
      setState({ threadId, size: expandable });
      return;
    }
    void loadEarlier(threadId).then(
      (applied) => {
        if (!applied) {
          return;
        }
        setFailed(false);
        const loaded = useSessionStore.getState().feeds[threadId]?.runs.length ?? runs.length;
        const expanded = Math.min(loaded, size + TAIL_RUNS);
        captureAnchor(target, expanded);
        setState({ threadId, size: expanded });
      },
      () => setFailed(true),
    );
  };
  const offset = Math.max(0, runs.length - size);
  return {
    size,
    offset,
    visible: runs.slice(offset),
    hiddenLoaded,
    hiddenTotal,
    canLoad,
    failed,
    loadMore,
    reveal: (runIndex: number) => {
      const needed = Math.max(TAIL_RUNS, runs.length - runIndex);
      setState((current) =>
        current.threadId === threadId && current.size >= needed
          ? current
          : { threadId, size: needed },
      );
    },
    reset: () => {
      setState((current) =>
        current.threadId === threadId && current.size === TAIL_RUNS
          ? current
          : { threadId, size: TAIL_RUNS },
      );
      setFailed(false);
    },
  };
}

export function LoadEarlierButton({ renderWindow }: { renderWindow: RenderWindow }) {
  if (!renderWindow.canLoad) {
    return null;
  }
  return (
    <MessageScrollerItem messageId="load-earlier">
      <Button variant="ghost" size="sm" className="mx-auto" onClick={renderWindow.loadMore}>
        <ArrowUpIcon />
        <span>
          {renderWindow.failed ? 'Retry load earlier' : 'Load earlier messages'}
          {renderWindow.hiddenTotal !== null && renderWindow.hiddenTotal > 0 ? (
            <span className="ms-1.5 text-muted-foreground tabular-nums">
              {renderWindow.hiddenTotal}
            </span>
          ) : null}
        </span>
      </Button>
    </MessageScrollerItem>
  );
}
