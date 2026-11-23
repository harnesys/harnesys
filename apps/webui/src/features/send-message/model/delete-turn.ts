import type { DeleteThreadEventResponse } from '@harnesys/contracts';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { deleteThreadUserEvent, toStudioSummary } from '@/shared/api';

export async function deleteUserMessage(threadId: string, threadSeq: number): Promise<void> {
  useSessionStore.getState().abortRun(threadId);
  const response = await deleteThreadUserEvent(threadId, threadSeq);
  applyDeleteResponse(threadId, response);
  dismissMatchingFailures(threadId);
}

export async function deleteErrorEvent(
  threadId: string,
  threadSeq: number,
  knownText?: string,
): Promise<void> {
  const response = await deleteThreadUserEvent(threadId, threadSeq);
  applyDeleteResponse(threadId, response);
  dismissMatchingFailures(threadId, knownText);
}

function applyDeleteResponse(threadId: string, response: DeleteThreadEventResponse): void {
  useThreadStore.getState().upsert(toClientThread(toStudioSummary(response.summary)));
  const session = useSessionStore.getState();
  session.setHistoryCursor(threadId, response.cursor);
  if (response.kind === 'truncated') {
    session.applyDeletions(threadId, [{ from: response.fromThreadSeq, to: 0 }]);
    return;
  }
  session.applyDeletions(threadId, [{ from: response.threadSeq, to: response.threadSeq }]);
}

export function deleteOptimisticUserMessage(threadId: string, clientEventId: string): void {
  useSessionStore.getState().removeEventByClientEventId(threadId, clientEventId);
}

export function dismissFailure(threadId: string, id: string): void {
  useSessionStore.getState().dismissFailure(threadId, id);
}

function dismissMatchingFailures(threadId: string, knownText?: string): void {
  const store = useSessionStore.getState();
  const targets =
    knownText === undefined
      ? store.failures.filter((item) => item.threadId === threadId)
      : store.failures.filter((item) => item.threadId === threadId && item.text === knownText);
  for (const item of targets) {
    store.dismissFailure(threadId, item.id);
  }
}
