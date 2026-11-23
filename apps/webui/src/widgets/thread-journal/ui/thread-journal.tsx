import type { SessionEvent } from '@harnesys/studio-shared';
import {
  issueCode,
  issueTaskAttrs,
  scheduledTaskName,
  visibleIssueText,
} from '@harnesys/studio-shared';
import { type ReactNode, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Agent } from '@/entities/agent';
import {
  type FeedRun,
  hasCompactedAnchor,
  hasRunningCompaction,
  type RunFailure,
  useSessionStore,
  useThreadFeed,
} from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { useCompactingStore } from '@/features/compact-thread';
import { scheduleMarkThreadRead, useThreadEvents } from '@/features/desk';
import { dismissFailure, retryRun } from '@/features/send-message';
import { nudgeIssueRecord } from '@/shared/api';
import { prefersReducedMotion } from '@/shared/lib/motion';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScrollerScrollable,
} from '@/shared/ui/message-scroller';
import {
  ChatSkeleton,
  CompactionPendingCard,
  FailedMessageView,
  LoadEarlierButton,
  RunTurn,
  ThreadEmpty,
  useRenderWindow,
  useSyncedThread,
} from '@/widgets/chat-transcript';
import { RunDivider } from './run-divider';

const EMPTY_FAILURES: RunFailure[] = [];
function lastCompactRunKey(runs: FeedRun[]): string | null {
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    if (run && hasCompactedAnchor(run)) {
      return run.key;
    }
  }
  return null;
}
export type TriggerThreadKind = 'schedule' | 'webhook' | 'issue';
export interface ThreadJournalProps {
  threadId: string;
  agent: Agent;
  kind: TriggerThreadKind;
}
export function ThreadJournal({ threadId, agent }: ThreadJournalProps) {
  const events = useThreadEvents(threadId);
  const feed = useThreadFeed(threadId);
  const thread = useThreadStore((state) => state.byId(threadId));
  const streaming = useSessionStore((state) => Boolean(state.activeRuns[threadId]));
  const compacting = useCompactingStore((state) => Boolean(state.byThread[threadId]));
  const synced = useSyncedThread(threadId, agent.orgId);
  const renderWindow = useRenderWindow(threadId, feed?.runs ?? []);
  const failures = useSessionStore(
    useShallow((state) => {
      const next = state.failures.filter((item) => item.threadId === threadId);
      return next.length === 0 ? EMPTY_FAILURES : next;
    }),
  );
  let body: ReactNode;
  if (!synced && events.length === 0 && !streaming && !compacting) {
    body = <ChatSkeleton />;
  } else if (events.length === 0 && !streaming && !compacting) {
    body = (
      <>
        <EmptyThreadReadSync threadId={threadId} />
        <ThreadEmpty agent={agent} threadId={threadId} />
      </>
    );
  } else {
    const runs = feed?.runs ?? [];
    const compactionLive = runs.some(hasRunningCompaction);
    const offset = renderWindow.offset;
    const visible = renderWindow.visible;
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : undefined;
    const lastError = thread?.lastError ?? null;
    const showLaunchError =
      lastError !== null && !streaming && !compacting && (lastRun?.error ?? null) === null;
    const undoableRunKey = !streaming && !compacting ? lastCompactRunKey(runs) : null;
    body = (
      <MessageScrollerProvider autoScroll>
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 text-[length:var(--chat-font-size)]">
              <LoadEarlierButton renderWindow={renderWindow} />
              {visible.map((run, sliceIndex) => (
                <JournalRunItem
                  key={run.key}
                  run={run}
                  index={offset + sliceIndex}
                  total={runs.length}
                  threadId={threadId}
                  streaming={streaming}
                  compacting={compacting}
                  undoable={undoableRunKey === run.key}
                />
              ))}
              {failures.map((failure) => (
                <MessageScrollerItem key={failure.id} messageId={failure.id}>
                  <FailedMessageView
                    text={failure.text}
                    onDelete={() => dismissFailure(threadId, failure.id)}
                  />
                </MessageScrollerItem>
              ))}
              {showLaunchError && lastError ? (
                <MessageScrollerItem key={`launch-error-${lastError.at}`} messageId="launch-error">
                  <FailedMessageView
                    text={lastError.message}
                    onRetry={() =>
                      void retryLaunchError(threadId, agent.orgId, thread?.issueId ?? null).catch(
                        () => {},
                      )
                    }
                  />
                </MessageScrollerItem>
              ) : null}
              {compacting && !compactionLive ? (
                <MessageScrollerItem key="compaction-pending" messageId="compaction-pending">
                  <CompactionPendingCard
                    onCancel={() => useCompactingStore.getState().abort(threadId)}
                  />
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton behavior={prefersReducedMotion() ? 'auto' : 'smooth'} />
          <ThreadReadSync threadId={threadId} onAtEnd={renderWindow.reset} />
        </MessageScroller>
      </MessageScrollerProvider>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="thread-journal">
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}
function JournalRunItem({
  run,
  index,
  total,
  threadId,
  streaming,
  compacting,
  undoable,
}: {
  run: FeedRun;
  index: number;
  total: number;
  threadId: string;
  streaming: boolean;
  compacting: boolean;
  undoable: boolean;
}) {
  const last = index === total - 1;
  const runStreaming = (streaming && last && !compacting) || hasRunningCompaction(run);
  const retryable = Boolean(run.runId) && last && !streaming && !compacting;
  return (
    <MessageScrollerItem messageId={run.key}>
      <RunDivider
        index={index}
        task={runTask(run.events)}
        failed={run.error !== null}
        running={runStreaming}
      />
      <RunTurn
        run={run}
        runId={run.runId ?? run.id ?? ''}
        threadId={threadId}
        streaming={runStreaming}
        undoable={undoable}
        onRetry={
          retryable ? () => void retryRun(threadId, run.runId ?? '').catch(() => {}) : undefined
        }
      />
    </MessageScrollerItem>
  );
}
function runTask(events: SessionEvent[]): string {
  const first = events.find((event) => event.type === 'user');
  if (!(first && first.type === 'user')) {
    return '';
  }
  const text = first.text ?? '';
  const attrs = issueTaskAttrs(text);
  if (attrs) {
    const title = visibleIssueText(text).split('\n')[0] ?? '';
    const code = attrs.issueId ? issueCode(attrs.issueId) : 'ISSUE';
    return `${code} · ${title}`;
  }
  return scheduledTaskName(text) ?? text;
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
function ThreadReadSync({ threadId, onAtEnd }: { threadId: string; onAtEnd: () => void }) {
  const { end } = useMessageScrollerScrollable();
  const contentEpoch = useSessionStore((state) => state.contentEpoch[threadId] ?? 0);
  const viewingAtEnd = !end;
  useEffect(() => {
    useThreadStore.getState().setViewingAtEnd(threadId, viewingAtEnd);
    if (viewingAtEnd && contentEpoch >= 0) {
      scheduleMarkThreadRead(threadId);
      onAtEnd();
      const maxThreadSeq = useSessionStore.getState().history[threadId]?.maxThreadSeq;
      if (maxThreadSeq !== undefined) {
        useSessionStore.getState().markViewed(threadId, maxThreadSeq);
      }
    }
  }, [threadId, viewingAtEnd, contentEpoch, onAtEnd]);
  useEffect(() => {
    return () => {
      useThreadStore.getState().setViewingAtEnd(threadId, false);
    };
  }, [threadId]);
  return null;
}
async function retryLaunchError(
  threadId: string,
  orgId: string,
  issueId: string | null,
): Promise<void> {
  const lastError = useThreadStore.getState().byId(threadId)?.lastError ?? null;
  if (issueId) {
    await nudgeIssueRecord(orgId, issueId);
    useThreadStore.getState().setLastError(threadId, null);
    return;
  }
  const runId = lastError?.runId;
  if (!runId || runId.startsWith('launch:')) {
    throw new Error('nothing to retry');
  }
  await retryRun(threadId, runId);
  useThreadStore.getState().setLastError(threadId, null);
}
