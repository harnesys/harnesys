import type { ThreadAttachment } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { useThreadStore, useThreadWorktreeStore } from '@/entities/thread';
import { useThreadQueueStore } from '@/features/message-queue';
import { ApiError, cancelRun, sendThreadRun } from '@/shared/api';
import { randomUUID } from '@/shared/lib/random-uuid';
import { preview, trace } from '@/shared/lib/trace';
import { connectThreadRun } from './client-registry';
import { requestRevealMessage, requestScrollToEnd } from './scroll-requests';
export interface SendMessageOptions {
  threadId: string;
  content: string;
  effort?: string;
  attachments?: ThreadAttachment[];
  mode?: string;
  skills?: string[];
}
interface RunConflictBody {
  code?: string;
  runId?: string;
  pendingAskId?: string;
}
export async function sendMessage(options: SendMessageOptions) {
  const { threadId, content, effort, attachments, mode, skills } = options;
  const trimmed = content.trim();
  if (!trimmed && !attachments?.length) {
    return;
  }
  trace('client', 'send start', { threadId, text: preview(trimmed) });
  const clientEventId = randomUUID();
  if (useSessionStore.getState().activeRuns[threadId]) {
    await queueWhileBusy(threadId, trimmed, attachments, clientEventId);
    return;
  }
  if (skills?.length) {
    useSessionStore.getState().setSentSkills(threadId, clientEventId, skills);
  }
  const startedHere = !useSessionStore.getState().activeRuns[threadId];
  const optimisticController = startedHere ? new AbortController() : null;
  if (startedHere && optimisticController) {
    useSessionStore.getState().startRun(threadId, optimisticController);
  }
  dismissThreadFailures(threadId);
  appendUserEvent(threadId, trimmed, attachments, clientEventId);
  requestRevealMessage(threadId, clientEventId);
  try {
    const binding = useThreadWorktreeStore.getState().get(threadId);
    const accepted = await sendThreadRun({
      id: threadId,
      text: trimmed,
      effort,
      attachmentIds: attachments?.map((item) => item.id),
      mode,
      skills,
      clientEventId,
      ...(binding ? { sourceId: binding.sourceId, worktreeId: binding.worktreeId } : {}),
    });
    if (optimisticController?.signal.aborted) {
      void cancelRun(threadId, accepted.runId).catch(() => {});
      return;
    }
    useThreadStore.getState().touch(threadId);
    connectThreadRun(threadId, accepted.runId);
    trace('client', 'POST accepted', { runId: accepted.runId, status: accepted.status });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const body = (error.body ?? {}) as RunConflictBody;
      if (handleConflict(threadId, clientEventId, body, startedHere)) {
        return;
      }
      if (await queueAsFallback(threadId, trimmed, attachments, clientEventId, startedHere)) {
        return;
      }
    }
    reportSendFailure(threadId, startedHere, error);
  }
}

function dismissThreadFailures(threadId: string): void {
  const store = useSessionStore.getState();
  for (const failure of store.failures.filter((item) => item.threadId === threadId)) {
    store.dismissFailure(threadId, failure.id);
  }
}

function appendUserEvent(
  threadId: string,
  text: string,
  attachments: ThreadAttachment[] | undefined,
  clientEventId: string,
): void {
  useSessionStore.getState().appendEvent(threadId, {
    type: 'user',
    text,
    attachments: attachments?.length
      ? attachments.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mediaType: item.mediaType,
          path: item.path,
        }))
      : undefined,
    clientEventId,
  });
}

function handleConflict(
  threadId: string,
  clientEventId: string,
  body: RunConflictBody,
  startedHere: boolean,
): boolean {
  if (body.runId) {
    useSessionStore.getState().removeEventByClientEventId(threadId, clientEventId);
    connectThreadRun(threadId, body.runId);
    return true;
  }
  if (body.pendingAskId) {
    useSessionStore.getState().removeEventByClientEventId(threadId, clientEventId);
    if (startedHere) {
      useSessionStore.getState().finishRun(threadId);
    }
    return true;
  }
  return false;
}

async function queueWhileBusy(
  threadId: string,
  text: string,
  attachments: ThreadAttachment[] | undefined,
  clientEventId: string,
): Promise<void> {
  try {
    await useThreadQueueStore.getState().add(threadId, {
      text,
      clientEventId,
      ...(attachments?.length ? { attachments } : {}),
    });
    requestScrollToEnd(threadId);
  } catch (error) {
    useSessionStore.getState().appendEvent(threadId, {
      type: 'error',
      code: 'send_failed',
      message: error instanceof Error ? error.message : 'Queue failed',
    });
  }
}

async function queueAsFallback(
  threadId: string,
  text: string,
  attachments: ThreadAttachment[] | undefined,
  clientEventId: string,
  startedHere: boolean,
): Promise<boolean> {
  try {
    await useThreadQueueStore.getState().add(threadId, {
      text,
      clientEventId,
      ...(attachments?.length ? { attachments } : {}),
    });
    requestScrollToEnd(threadId);
  } catch {
    return false;
  }
  const store = useSessionStore.getState();
  store.removeEventByClientEventId(threadId, clientEventId);
  if (startedHere) {
    store.finishRun(threadId);
  }
  return true;
}

function reportSendFailure(threadId: string, startedHere: boolean, error: unknown): void {
  trace('client', 'send failed', error instanceof Error ? error.message : error);
  if (startedHere) {
    useSessionStore.getState().finishRun(threadId);
  }
  useSessionStore.getState().appendEvent(threadId, {
    type: 'error',
    code: 'send_failed',
    message: error instanceof Error ? error.message : 'Send failed',
  });
}
