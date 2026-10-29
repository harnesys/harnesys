import type { SessionEvent } from '@harnesys/studio-shared';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Fragment, useEffect, useState, useSyncExternalStore } from 'react';
import type { Agent } from '@/entities/agent';
import {
  compactionCoverage,
  type FeedRun,
  firstLiveRunIndex,
  isCompactRun,
  isRunCovered,
  type RunFailure,
  useSessionStore,
  useThreadFeeds,
} from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { scheduleMarkThreadRead } from '@/features/desk';
import { useOpenSpawnTab } from '@/features/ide';
import {
  dismissFailure,
  onRevealMessageRequest,
  onScrollToEndRequest,
  retryRun,
} from '@/features/send-message';
import { subscribeAutoRead } from '@/shared/api/voice-prefs';
import { prefersReducedMotion } from '@/shared/lib/motion';
import { Button } from '@/shared/ui/button';
import { LiveRunScrollGuard } from '@/shared/ui/live-run-scroll-guard';
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
import { sliceTail } from '../model/tail-slice';
import { useSyncedThread } from '../model/thread-sync';
import { saveViewedCount, useUnseenBoundary } from '../model/unseen-boundary';
import { readAutoReadPref, useAutoRead } from '../model/use-auto-read';
import { usePrependRestore } from '../model/use-prepend-restore';
import { useUnseenCount } from '../model/use-unseen-count';
import { FailedMessageView } from './agent-turn';
import type { BranchChild } from './branch-point-badge';
import { ChatSkeleton } from './chat-skeleton';
import { CompactionPendingCard } from './compaction-card';
import { CompactionDividerItem } from './compaction-separator';
import { ForkSeparator } from './fork-separator';
import { LiveStatusBar } from './live-status-bar';
import { RunTurn } from './run-turn';
import { ThreadEmpty } from './thread-empty';
import { UnseenSeparator } from './unseen-separator';

const EMPTY_FAILURES: RunFailure[] = [];
const EMPTY_RUNS: FeedRun[] = [];
const EMPTY_EVENTS: SessionEvent[] = [];
const EMPTY_BRANCH_CHILDREN: Record<string, BranchChild[]> = {};
const TAIL_RUNS = 12;

export function ThreadPanel({
  threadId,
  agent,
  active,
}: {
  threadId: string;
  agent: Agent;
  active: boolean;
}) {
  const feeds = useThreadFeeds(threadId);
  const eventsCount = useSessionStore((state) => state.events[threadId]?.length ?? 0);
  const thread = useThreadStore((state) => (active ? state.byId(threadId) : undefined));
  const inheritedCount = useThreadStore((state) =>
    active ? (state.byId(threadId)?.inheritedEventCount ?? 0) : 0,
  );
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
  const [windowState, setWindowState] = useState<{ threadId: string; size: number }>({
    threadId,
    size: TAIL_RUNS,
  });
  const [revealState, setRevealState] = useState<{ threadId: string; key: string | null }>({
    threadId,
    key: null,
  });
  useEffect(() => {
    if (windowState.threadId !== threadId) {
      setWindowState({ threadId, size: TAIL_RUNS });
    }
  }, [threadId, windowState.threadId]);
  useEffect(() => {
    if (revealState.threadId !== threadId) {
      setRevealState({ threadId, key: null });
    }
  }, [threadId, revealState.threadId]);
  const windowSize = windowState.threadId === threadId ? windowState.size : TAIL_RUNS;
  const revealKey = revealState.threadId === threadId ? revealState.key : null;
  const captureEarlierAnchor = usePrependRestore(windowSize);
  const synced = useSyncedThread(active ? threadId : null, agent.orgId);
  const unseenBoundary = useUnseenBoundary(threadId, active, Boolean(thread?.unread), eventsCount);
  const branchChildrenByRun = active
    ? (() => {
        const children = allThreads.filter((item) => item.parentThreadId === threadId);
        if (children.length === 0) {
          return EMPTY_BRANCH_CHILDREN;
        }
        const grouped: Record<string, BranchChild[]> = {};
        for (const child of children) {
          if (!child.forkAt) {
            continue;
          }
          const group = grouped[child.forkAt];
          if (group) {
            group.push({ id: child.id, agentId: child.agentId, title: child.title });
          } else {
            grouped[child.forkAt] = [{ id: child.id, agentId: child.agentId, title: child.title }];
          }
        }
        return grouped;
      })()
    : EMPTY_BRANCH_CHILDREN;
  const failures = active
    ? allFailures.filter((item) => item.threadId === threadId)
    : EMPTY_FAILURES;
  useEffect(() => {
    if (!active) {
      return;
    }
    useSessionStore.getState().setThreadFeedBoundary(threadId, inheritedCount);
  }, [active, threadId, inheritedCount]);
  useEffect(() => {
    if (!active) {
      return;
    }
    return onRevealMessageRequest((targetThreadId, messageId) => {
      if (targetThreadId === threadId) {
        setRevealState({ threadId, key: messageId });
      }
    });
  }, [active, threadId]);
  useEffect(() => {
    if (!streaming && revealState.key !== null) {
      setRevealState({ threadId, key: null });
    }
  }, [streaming, threadId, revealState.key]);
  const inheritedRuns = feeds?.inherited.runs ?? EMPTY_RUNS;
  const ownRuns = feeds?.own.runs ?? EMPTY_RUNS;
  const threadEvents = useSessionStore((state) => state.events[threadId] ?? EMPTY_EVENTS);
  const coverage = compactionCoverage(threadEvents);
  const dividerIndex = firstLiveRunIndex(inheritedRuns, ownRuns, coverage.boundaryIndex);
  const lastOwnRun = ownRuns[ownRuns.length - 1];
  const autoReadEnabled = useSyncExternalStore(subscribeAutoRead, readAutoReadPref);
  useAutoRead({
    threadId,
    text: lastOwnRun ? runAnswerText(lastOwnRun) : '',
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
        <ThreadEmpty agent={agent} threadId={threadId} />
      </>
    );
  }
  const compactLive = compacting && ownRuns.some(isCompactRun);
  const showFork = Boolean(thread?.parentThreadId) && inheritedRuns.length > 0;
  const unseenRunIndex =
    unseenBoundary === null ? -1 : ownRuns.findIndex((run) => run.firstIndex >= unseenBoundary);
  const tail = sliceTail(inheritedRuns, ownRuns, windowSize, unseenRunIndex);
  return (
    <MessageScrollerProvider
      autoScroll={true}
      defaultScrollPosition="end"
      scrollPreviousItemPeek={48}
      scrollEdgeThreshold={24}
    >
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent className="text-(length:--chat-font-size) mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 opacity-80">
            {tail.hiddenCount > 0 ? (
              <MessageScrollerItem messageId="load-earlier">
                <Button
                  variant="ghost"
                  size="sm"
                  className="mx-auto"
                  onClick={(event) => {
                    const nextSize = windowSize + TAIL_RUNS;
                    captureEarlierAnchor(event, nextSize);
                    setRevealState({ threadId, key: null });
                    setWindowState({ threadId, size: nextSize });
                  }}
                >
                  <ArrowUpIcon />
                  <span>
                    Load earlier messages
                    <span className="ms-1.5 text-muted-foreground tabular-nums">
                      {tail.hiddenCount}
                    </span>
                  </span>
                </Button>
              </MessageScrollerItem>
            ) : null}
            {tail.inherited.map((run, sliceIndex) => {
              const forkAt = run.runId ?? run.id ?? '';
              const combined = inheritedRuns.length - tail.inherited.length + sliceIndex;
              return (
                <Fragment key={`inherited-${run.key}`}>
                  {combined === dividerIndex ? <CompactionDividerItem coverage={coverage} /> : null}
                  <MessageScrollerItem
                    key={`inherited-${run.key}`}
                    messageId={`inherited-${run.key}`}
                  >
                    <div className="pointer-events-none select-none opacity-60" aria-hidden>
                      <RunTurn
                        run={run}
                        runId={forkAt}
                        threadId={threadId}
                        onOpenSpawn={onOpenSpawn}
                        streaming={false}
                        inherited
                        branchChildren={branchChildrenByRun[forkAt]}
                      />
                    </div>
                  </MessageScrollerItem>
                </Fragment>
              );
            })}
            {showFork && parent ? (
              <MessageScrollerItem messageId="fork-separator">
                <ForkSeparator parentThreadId={parent.id} parentAgentId={parent.agentId} />
              </MessageScrollerItem>
            ) : null}
            {tail.own.map((run, sliceIndex) => {
              const index = tail.ownCut + sliceIndex;
              const last = index === ownRuns.length - 1;
              const runStreaming =
                (streaming && last && !compacting) || (compacting && last && isCompactRun(run));
              const forkAt = run.runId ?? run.id ?? '';
              const combined = inheritedRuns.length + index;
              const covered = isRunCovered(run, coverage.boundaryIndex);
              return (
                <Fragment key={run.key}>
                  {index === unseenRunIndex ? (
                    <MessageScrollerItem messageId="unseen-separator">
                      <UnseenSeparator />
                    </MessageScrollerItem>
                  ) : null}
                  {combined === dividerIndex ? <CompactionDividerItem coverage={coverage} /> : null}
                  <MessageScrollerItem
                    messageId={run.key}
                    scrollAnchor={last && run.key === revealKey}
                  >
                    <div className={covered ? 'opacity-55' : undefined}>
                      <RunTurn
                        run={run}
                        runId={forkAt}
                        threadId={threadId}
                        onOpenSpawn={onOpenSpawn}
                        streaming={runStreaming}
                        branchChildren={branchChildrenByRun[forkAt]}
                        onRetry={
                          run.runId && last && !streaming && !compacting
                            ? () => void retryRun(threadId, run.runId ?? '').catch(() => {})
                            : undefined
                        }
                      />
                    </div>
                    {last ? <LiveRunScrollGuard active={streaming || compacting} /> : null}
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
            {compacting && !compactLive ? (
              <MessageScrollerItem key="compaction-pending" messageId="compaction-pending">
                <CompactionPendingCard />
              </MessageScrollerItem>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {active ? <LiveEdgeControls threadId={threadId} /> : null}
        {active ? <ScrollToEndSync threadId={threadId} /> : null}
        {active && streaming && ownRuns.length > 0 ? (
          <LiveStatusBar run={ownRuns[ownRuns.length - 1]} streaming />
        ) : null}
        {active ? <ThreadReadSync threadId={threadId} /> : null}
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
function runAnswerText(run: FeedRun): string {
  return run.segments
    .filter((segment) => segment.kind === 'text' || segment.kind === 'compaction')
    .map((segment) => segment.text)
    .join('\n\n');
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
  const total = useSessionStore((state) => state.events[threadId]?.length ?? 0);
  const unseen = useUnseenCount(total, !end);
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
function ThreadReadSync({ threadId }: { threadId: string }) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);
  const viewingAtEnd = !end;
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, viewingAtEnd);
    if (viewingAtEnd && contentEpoch >= 0) {
      scheduleMarkThreadRead(threadId);
      saveViewedCount(threadId, useSessionStore.getState().events[threadId]?.length ?? 0);
    }
  }, [threadId, viewingAtEnd, contentEpoch]);
  useEffect(() => {
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}
