import { useSessionStore } from '@/entities/session';
import { cancelRun, rejectRun, respondToRun, retryRun } from '@/shared/api/threads';
import { randomUUID } from '@/shared/lib/random-uuid';

export async function runRespond(threadId: string, askId: string, payload: unknown): Promise<void> {
  const runId = useSessionStore.getState().runIdOf(threadId);
  if (!runId) {
    return;
  }
  await respondToRun(threadId, runId, {
    askId,
    payload,
    clientEventId: randomUUID(),
  }).catch(() => {});
}

export async function runReject(threadId: string, askId: string, note?: string): Promise<void> {
  const runId = useSessionStore.getState().runIdOf(threadId);
  if (!runId) {
    return;
  }
  await rejectRun(threadId, runId, {
    askId,
    note,
    clientEventId: randomUUID(),
  }).catch(() => {});
}

export async function runRetry(threadId: string): Promise<void> {
  const runId = useSessionStore.getState().runIdOf(threadId);
  if (!runId) {
    return;
  }
  await retryRun(threadId, runId).catch(() => {});
}

export async function runCancel(threadId: string): Promise<void> {
  const runId = useSessionStore.getState().runIdOf(threadId);
  if (!runId) {
    return;
  }
  await cancelRun(threadId, runId).catch(() => {});
}
