import type { EventsWatchThreadEventsFrame, SessionEvent } from '@harnesys/studio-shared';
import { useAgentStore } from '@/entities/agent';
import { useActiveOrgStore, useOrgActivityStore } from '@/entities/org-machine';
import { hasPendingAppend, useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { useThreadQueueStore } from '@/features/message-queue';
import { getThread } from '@/shared/api';
import { trace } from '@/shared/lib/trace';
import { duplicateDelivery } from './delivery';
import { syncRunStateFromThread } from './sync-run-state';

export function dispatchThreadEvents(frame: EventsWatchThreadEventsFrame): void {
  const threadId = frame.threadId;
  if (!threadId) {
    return;
  }
  for (const event of frame.events ?? []) {
    try {
      applyEvent(threadId, event, frame.orgId);
    } catch (error) {
      trace('thread-events', `apply failed ${event.type}`, error);
    }
  }
}

export async function resyncThreadEvents(orgId: string): Promise<void> {
  const session = useSessionStore.getState();
  const threads = useThreadStore
    .getState()
    .items.filter(
      (thread) =>
        thread.orgId === orgId &&
        (session.activeRuns[thread.id] !== undefined || session.events[thread.id] !== undefined),
    );
  await Promise.all(threads.map((thread) => reconcileThread(thread.id)));
}

function isDuplicate(threadId: string, event: SessionEvent): boolean {
  const { runId, seq } = event;
  const ceiling = useSessionStore.getState().seqCeil[threadId];
  return duplicateDelivery({
    runId,
    seq,
    appliedCeiling: (runId === undefined ? undefined : ceiling?.[runId]) ?? 0,
    queued: hasPendingAppend(threadId, runId, seq),
  });
}

function applyEvent(threadId: string, event: SessionEvent, orgId: string | undefined): void {
  const session = useSessionStore.getState();
  if (isDuplicate(threadId, event)) {
    return;
  }
  session.appendEvent(threadId, event);
  handleFollowUps(threadId, event, orgId);
}

function handleFollowUps(threadId: string, event: SessionEvent, orgId: string | undefined): void {
  if (event.type === 'run.started') {
    handleRunStarted(threadId, event);
  } else if (
    event.type === 'run.completed' ||
    event.type === 'run.failed' ||
    event.type === 'run.cancelled'
  ) {
    handleTerminal(threadId, event, orgId);
  } else if (event.type === 'user') {
    const candidate = event as { clientEventId?: string };
    if (candidate.clientEventId) {
      handleUserEvent(threadId, event);
    }
  } else if (event.type === 'ask') {
    useThreadStore.getState().markUnread(threadId);
  } else if (event.type === 'error') {
    const candidate = event as { message?: string };
    setError(threadId, candidate.message ?? '');
  } else if (event.type === 'agent.handoff' && event.agentId) {
    patchThreadCurrentAgent(threadId, event.agentId);
  }
}

function handleRunStarted(threadId: string, event: SessionEvent): void {
  const session = useSessionStore.getState();
  if (event.runId) {
    if (session.activeRuns[threadId]) {
      session.setRunId(threadId, event.runId);
    } else {
      session.startRun(threadId, new AbortController(), event.runId);
    }
  }
  if (event.runId) {
    useThreadStore.getState().markUnread?.(threadId);
  }
}

function handleTerminal(threadId: string, event: SessionEvent, orgId: string | undefined): void {
  const session = useSessionStore.getState();
  if (event.runId) {
    session.finishRun(threadId, event.runId);
  } else {
    session.finishRun(threadId);
  }
  void reconcileThread(threadId);
  if (orgId && orgId !== useActiveOrgStore.getState().orgId) {
    useOrgActivityStore.getState().bump(orgId, 1);
  } else {
    maybeMarkUnread(threadId);
  }
}

function handleUserEvent(threadId: string, event: SessionEvent): void {
  const candidate = event as { clientEventId?: string };
  if (!candidate.clientEventId) {
    return;
  }
  useThreadQueueStore.getState().discardDelivered(threadId, candidate.clientEventId);
  maybeMarkUnread(threadId);
}

function setError(threadId: string, message: string): void {
  useSessionStore.getState().setFailure({
    id: `failed-${threadId}-${Date.now()}`,
    threadId,
    text: message,
  });
}

async function reconcileThread(threadId: string): Promise<void> {
  try {
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    syncRunStateFromThread(record.id, record.activeRun ?? null);
    useSessionStore.getState().reconcileEvents(threadId, record.events);
    if (record.unread) {
      useThreadStore.getState().markUnread(threadId);
    }
  } catch (error) {
    trace('thread-events', 'reconcile failed', error instanceof Error ? error.message : error);
  }
}

function patchThreadCurrentAgent(threadId: string, agentId: string): void {
  const thread = useThreadStore.getState().byId(threadId);
  if (!thread || thread.agentId === agentId) {
    return;
  }
  const agent = useAgentStore.getState().byId(agentId);
  if (agent?.parentId) {
    return;
  }
  useThreadStore.getState().upsert({ ...thread, agentId });
}

export function maybeMarkUnread(threadId: string): void {
  const viewing = useThreadStore.getState().isViewingAtEnd?.(threadId) ?? false;
  if (viewing) {
    return;
  }
  useThreadStore.getState().markUnread(threadId);
}
