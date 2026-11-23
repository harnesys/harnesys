import { isIssueHumanText } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { getThreadEvent, nudgeIssueRecord } from '@/shared/api';
import { deleteUserMessage } from './delete-turn';

export interface RerunIssueTaskInput {
  orgId: string;
  threadId: string;
  issueId: string;
}

export async function rerunIssueTask(input: RerunIssueTaskInput): Promise<void> {
  const seq = await firstIssueTaskSeq(input.threadId);
  if (seq !== undefined) {
    await deleteUserMessage(input.threadId, seq);
  }
  await nudgeIssueRecord(input.orgId, input.issueId);
}

async function firstIssueTaskSeq(threadId: string): Promise<number | undefined> {
  const firstUserThreadSeq = useSessionStore.getState().history[threadId]?.firstUserThreadSeq;
  if (firstUserThreadSeq !== undefined && firstUserThreadSeq !== null) {
    const event = await loadEvent(threadId, firstUserThreadSeq);
    if (event !== undefined && event.type === 'user' && isIssueHumanText(event.text)) {
      return firstUserThreadSeq;
    }
  }
  return scanIssueTaskSeq(threadId);
}

async function loadEvent(threadId: string, threadSeq: number) {
  const local = useSessionStore
    .getState()
    .eventsOf(threadId)
    .find((event) => event.threadSeq === threadSeq);
  if (local !== undefined) {
    return local;
  }
  return getThreadEvent(threadId, threadSeq).catch(() => undefined);
}

// An issue thread's task is its first user event; a changed shape moves this lookup server-side.
function scanIssueTaskSeq(threadId: string): number | undefined {
  for (const event of useSessionStore.getState().eventsOf(threadId)) {
    if (event.type === 'user' && event.threadSeq !== undefined && isIssueHumanText(event.text)) {
      return event.threadSeq;
    }
  }
  return undefined;
}
