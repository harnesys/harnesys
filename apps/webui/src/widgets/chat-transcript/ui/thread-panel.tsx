import type { SessionEvent } from '@harnesys/studio-shared';
import { ArrowDownIcon } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router';
import type { Agent } from '@/entities/agent';
import {
  compactionCoverage,
  coveredRunCount,
  type FeedRun,
  firstLiveRunIndex,
  hasRunningCompaction,
  type RunFailure,
  useSessionStore,
  useThreadFeed,
} from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { refreshThread, scheduleMarkThreadRead } from '@/features/desk';
import { useOpenSpawnTab } from '@/features/ide';
import { dismissFailure, onScrollToEndRequest, retryRun } from '@/features/send-message';
import { subscribeAutoRead } from '@/shared/api/voice-prefs';
import { AROUND_THREAD_SEQ_PARAM, parseAroundThreadSeq } from '@/shared/config/routes';
import { prefersReducedMotion } from '@/shared/lib/motion';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from '@/shared/ui/message-scroller';
import { useLoadEarlierTrigger } from '../model/load-earlier-trigger';
import { useSyncedThread } from '../model/thread-sync';
import { useUnseenBoundary } from '../model/unseen-boundary';
import { readAutoReadPref, useAutoRead } from '../model/use-auto-read';
import { useUnseenCount } from '../model/use-unseen-count';
import { FailedMessageView } from './agent-turn';
import type { BranchChild } from './branch-point-badge';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionPendingCard } from './compaction-card';
import { CompactionDividerItem } from './compaction-separator';
import { ForkSeparator } from './fork-separator';
import { LiveStatusBar } from './live-status-bar';
import { LoadEarlierButton, type RenderWindow, useRenderWindow } from './load-earlier';
import { RunTurn } from './run-turn';
import { ThreadEmpty } from './thread-empty';
import { groupBranchChildren, registerRevealRequest, undoableRunKeyOf } from './thread-panel-aux';
import { UnseenSeparator } from './unseen-separator';

const EMPTY_FAILURES: RunFailure[] = [];
const EMPTY_RUNS: FeedRun[] = [];
const EMPTY_EVENTS: SessionEvent[] = [];
const EMPTY_BRANCH_CHILDREN: Record<string, BranchChild[]> = {};

export function ThreadPanel({
  threadId,
  agent,
  active,
  assistant = false,
}: {
  threadId: string;
  agent: Agent;
  active: boolean;
  assistant?: boolean;
}) {
  const feed = useThreadFeed(threadId);
  const eventsCount = useSessionStore((state) => state.events[threadId]?.length ?? 0);
  const thread = useThreadStore((state) => (active ? state.byId(threadId) : undefined));
  const parent = useThreadStore((state) => {
    if (!active) {
      return undefined;
    }
    const current = state.byId(threadId);
    return current?.parentThreadId ? state.byId(current.parentThreadId) : undefined;
  });
  const openSpawnTab = useOpenSpawnTab();
  const onOpenSpawn = (spawnId: string) => openSpawnTab(agent.orgId, agent.id, threadId, spawnId);
  const streaming = useSessionStore((state) => active && Boolean(state.activeRuns[threadId]));
  const allThreads = useThreadStore((state) => state.items);
  const allFailures = useSessionStore((state) => state.failures);
  const compacting = useCompactingStore((state) => active && Boolean(state.byThread[threadId]));
  const [revealState, setRevealState] = useState<{ threadId: string; key: string | null }>({
    threadId,
    key: null,
  });
  useEffect(() => {
    if (revealState.threadId !== threadId) {
      setRevealState({ threadId, key: null });
    }
  }, [threadId, revealState.threadId]);
  const revealKey = revealState.threadId === threadId ? revealState.key : null;
  const synced = useSyncedThread(active ? threadId : null, agent.orgId);
  const branchChildrenByRun = active
    ? groupBranchChildren(allThreads, threadId)
    : EMPTY_BRANCH_CHILDREN;
  const failures = active
    ? allFailures.filter((item) => item.threadId === threadId)
    : EMPTY_FAILURES;
  const unseenSeq = useUnseenBoundary(threadId, active, Boolean(thread?.unread), eventsCount);
  const onScrollEarlier = useLoadEarlierTrigger(threadId);
  useEffect(() => {
    if (!active) {
      return;
    }
    return registerRevealRequest(threadId, setRevealState);
  }, [active, threadId]);
  useEffect(() => {
    if (!streaming && revealState.key !== null) {
      setRevealState({ threadId, key: null });
    }
  }, [streaming, threadId, revealState.key]);
  const runs = feed?.runs ?? EMPTY_RUNS;
  const renderWindow = useRenderWindow(threadId, runs);
  const deepLink = useDeepLinkTarget(runs, renderWindow, active);
  const undoableRunKey = undoableRunKeyOf(streaming, compacting, runs);
  const threadEvents = useSessionStore((state) => state.events[threadId] ?? EMPTY_EVENTS);
  const coverage = compactionCoverage(threadEvents);
  const coveredCount = coveredRunCount(runs, coverage);
  const dividerIndex = firstLiveRunIndex(runs, coverage);
  const lastRun = runs[runs.length - 1];
  const autoReadEnabled = useSyncExternalStore(subscribeAutoRead, readAutoReadPref);
  useAutoRead({
    threadId,
    text: lastRun ? runAnswerText(lastRun) : '',
    streaming,
    enabled: autoReadEnabled,
  });
  if (!synced && eventsCount === 0 && !streaming && !compacting) {
    return <ChatSkeleton />;
  }
  if (eventsCount === 0 && !streaming && !compacting) {
    return (
      <>
        <EmptyThreadReadSync threadId={threadId} />
        <ThreadEmpty agent={agent} threadId={threadId} assistant={assistant} />
      </>
    );
  }
  const compactionLive = runs.some(hasRunningCompaction);
  const offset = renderWindow.offset;
  const visible = renderWindow.visible;
  const unseenRunIndex =
    unseenSeq === null
      ? -1
      : runs.findIndex((run) => run.firstThreadSeq === null || run.firstThreadSeq > unseenSeq);
  const parentThreadId = thread?.parentThreadId ?? null;
  return (
    <MessageScrollerProvider
      autoScroll={true}
      defaultScrollPosition="end"
      scrollPreviousItemPeek={48}
      scrollEdgeThreshold={24}
    >
      <MessageScroller>
        <MessageScrollerViewport onScroll={onScrollEarlier}>
          <MessageScrollerContent className="text-(length:--chat-font-size) mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 opacity-80">
            <LoadEarlierButton renderWindow={renderWindow} />
            {parentThreadId ? (
              <MessageScrollerItem messageId="fork-separator">
                <ForkSeparator
                  parentThreadId={parentThreadId}
                  parentAgentId={parent?.agentId ?? thread?.agentId ?? ''}
                />
              </MessageScrollerItem>
            ) : null}
            {visible.map((run, sliceIndex) => {
              const index = offset + sliceIndex;
              const last = index === runs.length - 1;
              const runStreaming = (streaming && last && !compacting) || hasRunningCompaction(run);
              const forkAt = run.runId ?? run.id ?? '';
              return (
                <Fragment key={run.key}>
                  {index === unseenRunIndex ? (
                    <MessageScrollerItem messageId="unseen-separator">
                      <UnseenSeparator />
                    </MessageScrollerItem>
                  ) : null}
                  {index === dividerIndex ? <CompactionDividerItem coverage={coverage} /> : null}
                  <MessageScrollerItem
                    messageId={run.key}
                    scrollAnchor={last && run.key === revealKey}
                  >
                    <div className={index < coveredCount ? 'opacity-55' : undefined}>
                      <RunTurn
                        run={run}
                        runId={forkAt}
                        threadId={threadId}
                        onOpenSpawn={onOpenSpawn}
                        streaming={runStreaming}
                        branchChildren={branchChildrenByRun[forkAt]}
                        undoable={undoableRunKey === run.key}
                        onRetry={
                          run.runId && last && !streaming && !compacting
                            ? () => void retryRun(threadId, run.runId ?? '').catch(() => {})
                            : undefined
                        }
                      />
                    </div>
                  </MessageScrollerItem>
                </Fragment>
              );
            })}
            {failures.map((failure) => (
              <MessageScrollerItem key={failure.id} messageId={failure.id}>
                <FailedMessageView
                  text={failure.text}
                  onDelete={() => dismissFailure(threadId, failure.id)}
                />
              </MessageScrollerItem>
            ))}
            {compacting && !compactionLive ? (
              <MessageScrollerItem key="compaction-pending" messageId="compaction-pending">
                <CompactionPendingCard
                  onCancel={() => useCompactingStore.getState().abort(threadId)}
                />
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {active ? <LiveEdgeControls threadId={threadId} /> : null}
        {active ? <ScrollToEndSync threadId={threadId} /> : null}
        {active && streaming && runs.length > 0 ? (
          <LiveStatusBar run={runs[runs.length - 1]} streaming />
        ) : null}
        {active ? <DeepLinkScroll seq={deepLink.seq} targetKey={deepLink.key} /> : null}
        {active ? (
          <ThreadReadSync
            threadId={threadId}
            onAtEnd={renderWindow.reset}
            hasDeepLink={deepLink.seq !== undefined}
          />
        ) : null}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
function useDeepLinkTarget(
  runs: FeedRun[],
  renderWindow: RenderWindow,
  active: boolean,
): { seq: number | undefined; key: string | null } {
  const [searchParams] = useSearchParams();
  const seq = active ? parseAroundThreadSeq(searchParams.get(AROUND_THREAD_SEQ_PARAM)) : undefined;
  const index = seq === undefined ? -1 : runIndexForSeq(runs, seq);
  const key = index >= 0 && index >= renderWindow.offset ? (runs[index]?.key ?? null) : null;
  useEffect(() => {
    if (index < 0 || index >= renderWindow.offset) {
      return;
    }
    renderWindow.reveal(index);
  }, [index, renderWindow]);
  return { seq, key };
}

function runAnswerText(run: FeedRun): string {
  return run.segments
    .filter((segment) => segment.kind === 'text' || segment.kind === 'compaction')
    .map((segment) => segment.text)
    .join('\n\n');
}

function runIndexForSeq(runs: FeedRun[], threadSeq: number): number {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < runs.length; index++) {
    const run = runs[index];
    const first = run?.firstThreadSeq;
    const last = run?.lastThreadSeq;
    if (first === null || first === undefined || last === null || last === undefined) {
      continue;
    }
    let distance = 0;
    if (threadSeq < first) {
      distance = first - threadSeq;
    } else if (threadSeq > last) {
      distance = threadSeq - last;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function EmptyThreadReadSync({ threadId }: { threadId: string }) {
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, true);
    scheduleMarkThreadRead(threadId);
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}
function LiveEdgeControls({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const events = useSessionStore((state) => state.events[threadId] ?? EMPTY_EVENTS);
  const unseen = useUnseenCount(events, !end);
  return (
    <MessageScrollerButton behavior={prefersReducedMotion() ? 'auto' : 'smooth'}>
      <ArrowDownIcon />
      <span className="sr-only">
        {unseen > 0 ? `${unseen} new updates, scroll to end` : 'Scroll to end'}
      </span>
      {unseen > 0 ? (
        <span className="absolute -end-1 -top-1 min-w-4 rounded-full bg-live px-1 font-medium text-[10px] text-white tabular-nums">
          {unseen > 99 ? '99+' : unseen}
        </span>
      ) : null}
    </MessageScrollerButton>
  );
}
function ScrollToEndSync({ threadId }: { threadId: string }) {
  const { scrollToEnd } = useMessageScroller();
  useEffect(
    () =>
      onScrollToEndRequest((targetThreadId) => {
        if (targetThreadId === threadId) {
          scrollToEnd({ behavior: 'auto' });
        }
      }),
    [threadId, scrollToEnd],
  );
  return null;
}
function DeepLinkScroll({ seq, targetKey }: { seq: number | undefined; targetKey: string | null }) {
  const { scrollToMessage } = useMessageScroller();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (seq === undefined || targetKey === null) {
      return;
    }
    if (!scrollToMessage(targetKey, { align: 'center', behavior: 'auto' })) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete(AROUND_THREAD_SEQ_PARAM);
    setSearchParams(next, { replace: true });
  }, [seq, targetKey, scrollToMessage, searchParams, setSearchParams]);
  return null;
}
function ThreadReadSync({
  threadId,
  onAtEnd,
  hasDeepLink,
}: {
  threadId: string;
  onAtEnd: () => void;
  hasDeepLink: boolean;
}) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);
  const hasMoreAfter = useSessionStore((state) => state.history[threadId]?.hasMoreAfter ?? false);
  const viewingAtEnd = !end;
  const wasAtEnd = useRef(hasDeepLink);
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, viewingAtEnd);
    if (viewingAtEnd && contentEpoch >= 0) {
      scheduleMarkThreadRead(threadId);
      const maxThreadSeq = useSessionStore.getState().history[threadId]?.maxThreadSeq;
      if (maxThreadSeq !== undefined) {
        useSessionStore.getState().markViewed(threadId, maxThreadSeq);
      }
    }
  }, [threadId, viewingAtEnd, contentEpoch]);
  useEffect(() => {
    const returnedToEnd = viewingAtEnd && !wasAtEnd.current;
    wasAtEnd.current = viewingAtEnd;
    if (!returnedToEnd) {
      return;
    }
    onAtEnd();
    if (hasMoreAfter) {
      void refreshThread(threadId, { force: true, tail: true });
    }
  }, [threadId, viewingAtEnd, hasMoreAfter, onAtEnd]);
  useEffect(() => {
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}
