import type { MessageQuote } from '@harnesys/contracts';
import type { ThreadAttachment } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { useThreadStore, useThreadWorktreeStore } from '@/entities/thread';
import { useThreadQueueStore } from '@/features/message-queue';
import { ApiError, cancelRun, sendThreadRun } from '@/shared/api';
import { randomUUID } from '@/shared/lib/random-uuid';
import { preview, trace } from '@/shared/lib/trace';
// run tracking now arrives through the unified org event hub
import { requestRevealMessage, requestScrollToEnd } from './scroll-requests';
export interface SendMessageOptions {
  threadId: string;
  content: string;
  quote?: MessageQuote;
  effort?: string;
  attachments?: ThreadAttachment[];
  mode?: string;
  skills?: string[];
  onFailure?: () => void;
}
interface RunConflictBody {
  code?: string;
  runId?: string;
  pendingAskId?: string;
}
export async function sendMessage(options: SendMessageOptions) {
  const { threadId, content, quote, effort, attachments, mode, skills, onFailure } = options;
  const trimmed = content.trim();
  if (!trimmed && !attachments?.length) {
    return;
  }
  trace('client', 'send start', { threadId, text: preview(trimmed) });
  const clientEventId = randomUUID();
  if (useSessionStore.getState().activeRuns[threadId]) {
    await queueWhileBusy({ threadId, text: trimmed, attachments, clientEventId, quote }, onFailure);
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
  appendUserEvent({ threadId, text: trimmed, attachments, clientEventId, quote });
  requestRevealMessage(threadId, clientEventId);
  try {
    const binding = useThreadWorktreeStore.getState().get(threadId);
    const accepted = await sendThreadRun({
      id: threadId,
      text: trimmed,
      ...(quote ? { quote } : {}),
      effort,
      attachmentIds: attachments?.map((item) => item.id),
      mode,
      skills,
      clientEventId,
      ...(binding ? { workspaceRef: binding.workspaceRef } : {}),
    });
    if (accepted.status === 'stored') {
      useThreadStore.getState().touch(threadId);
      useSessionStore.getState().setEventThreadSeq(threadId, clientEventId, accepted.threadSeq);
      useSessionStore.getState().finishRun(threadId);
      return;
    }
    if (optimisticController?.signal.aborted) {
      void cancelRun(threadId, accepted.runId).catch(() => {});
      return;
    }
    useThreadStore.getState().touch(threadId);
    const store = useSessionStore.getState();
    if (store.activeRuns[threadId]) {
      store.setRunId(threadId, accepted.runId);
    } else {
      store.startRun(threadId, new AbortController(), accepted.runId);
    }
    trace('client', 'POST accepted', { runId: accepted.runId, status: accepted.status });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const body = (error.body ?? {}) as RunConflictBody;
      if (handleConflict(threadId, clientEventId, body, startedHere)) {
        return;
      }
      const queued = { threadId, text: trimmed, attachments, clientEventId, quote };
      if (await queueAsFallback(queued, startedHere)) {
        return;
      }
    }
    reportSendFailure(threadId, startedHere, error, onFailure);
  }
}

function dismissThreadFailures(threadId: string): void {
  const store = useSessionStore.getState();
  for (const failure of store.failures.filter((item) => item.threadId === threadId)) {
    store.dismissFailure(threadId, failure.id);
  }
}

function appendUserEvent(queued: QueuedSend): void {
  const { threadId, text, attachments, clientEventId, quote } = queued;
  useSessionStore.getState().appendEvent(threadId, {
    type: 'user',
    text,
    ...(quote ? { quote } : {}),
    attachments: attachments?.length
      ? attachments.map((item) => ({
          id: item.id,
          kind: item.kind,
          name: item.name,
          mediaType: item.mediaType,
          path: item.path,
          sizeBytes: item.sizeBytes,
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
    const store = useSessionStore.getState();
    if (store.activeRuns[threadId]) {
      store.setRunId(threadId, body.runId);
    } else {
      store.startRun(threadId, new AbortController(), body.runId);
    }
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

interface QueuedSend {
  threadId: string;
  text: string;
  attachments?: ThreadAttachment[];
  clientEventId: string;
  quote?: MessageQuote;
}

function addToQueue(queued: QueuedSend): Promise<unknown> {
  const { threadId, text, attachments, clientEventId, quote } = queued;
  return useThreadQueueStore.getState().add(threadId, {
    text,
    clientEventId,
    ...(attachments?.length ? { attachments } : {}),
    ...(quote ? { quote } : {}),
  });
}

async function queueWhileBusy(queued: QueuedSend, onFailure?: () => void): Promise<void> {
  const { threadId } = queued;
  try {
    await addToQueue(queued);
    requestScrollToEnd(threadId);
  } catch (error) {
    onFailure?.();
    useSessionStore.getState().appendEvent(threadId, {
      type: 'error',
      code: 'send_failed',
      message: error instanceof Error ? error.message : 'Queue failed',
    });
  }
}

async function queueAsFallback(queued: QueuedSend, startedHere: boolean): Promise<boolean> {
  const { threadId, clientEventId } = queued;
  try {
    await addToQueue(queued);
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

function reportSendFailure(
  threadId: string,
  startedHere: boolean,
  error: unknown,
  onFailure?: () => void,
): void {
  trace('client', 'send failed', error instanceof Error ? error.message : error);
  onFailure?.();
  if (startedHere) {
    useSessionStore.getState().finishRun(threadId);
  }
  useSessionStore.getState().appendEvent(threadId, {
    type: 'error',
    code: 'send_failed',
    message: error instanceof Error ? error.message : 'Send failed',
  });
}
