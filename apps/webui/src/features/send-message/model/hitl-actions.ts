import { useSessionStore } from '@/entities/session';
import { ApiError, rejectRun, respondToRun, retryRun as retryRunRequest } from '@/shared/api';
import { randomUUID } from '@/shared/lib/random-uuid';

export async function respondToAsk(
  threadId: string,
  askId: string,
  payload: unknown,
): Promise<void> {
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

export async function rejectAsk(threadId: string, askId: string, note?: string): Promise<void> {
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

export async function retryRun(threadId: string, runId: string): Promise<void> {
  try {
    await retryRunRequest(threadId, runId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) {
      throw error;
    }
  }
}
