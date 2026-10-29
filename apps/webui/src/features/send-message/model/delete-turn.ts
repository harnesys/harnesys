import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { deleteThreadUserEvent } from '@/shared/api';

export async function deleteUserMessage(
  threadId: string,
  runId: string,
  seq: number,
): Promise<void> {
  useSessionStore.getState().abortRun(threadId);
  const record = await deleteThreadUserEvent(threadId, runId, seq);
  useThreadStore.getState().upsert(toClientThread(record));
  useSessionStore.getState().replaceEvents(record.id, record.events);
  dismissMatchingFailures(threadId);
}

export async function deleteErrorEvent(
  threadId: string,
  runId: string,
  seq: number,
  knownText?: string,
): Promise<void> {
  const record = await deleteThreadUserEvent(threadId, runId, seq);
  useThreadStore.getState().upsert(toClientThread(record));
  useSessionStore.getState().replaceEvents(record.id, record.events);
  dismissMatchingFailures(threadId, knownText);
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
