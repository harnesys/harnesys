import { useSessionStore } from '@/entities/session';
import { useThreadStore } from '@/entities/thread';
import { ApiError, rejectRun, respondToRun, retryRun as retryRunRequest } from '@/shared/api';
import { randomUUID } from '@/shared/lib/random-uuid';

export interface AskRef {
  askId: string;
  runId?: string;
}

function runIdOfAsk(threadId: string, ask: AskRef): string {
  const runId =
    ask.runId ??
    useSessionStore.getState().runIdOf(threadId) ??
    useThreadStore.getState().byId(threadId)?.activeRun?.runId;
  if (!runId) {
    throw new ApiError(409, 'This run is no longer waiting for an answer');
  }
  return runId;
}

export async function respondToAsk(threadId: string, ask: AskRef, payload: unknown): Promise<void> {
  await respondToRun(threadId, runIdOfAsk(threadId, ask), {
    askId: ask.askId,
    payload,
    clientEventId: randomUUID(),
  });
}

export async function rejectAsk(threadId: string, ask: AskRef, note?: string): Promise<void> {
  await rejectRun(threadId, runIdOfAsk(threadId, ask), {
    askId: ask.askId,
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
