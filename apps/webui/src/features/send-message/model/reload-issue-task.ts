import { isIssueHumanText } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { nudgeIssueRecord } from '@/shared/api';
import { deleteUserMessage } from './delete-turn';

export interface RerunIssueTaskInput {
  orgId: string;
  threadId: string;
  issueId: string;
}

export async function rerunIssueTask(input: RerunIssueTaskInput): Promise<void> {
  const seq = firstIssueTaskSeq(input.threadId);
  if (seq !== undefined) {
    await deleteUserMessage(input.threadId, seq);
  }
  await nudgeIssueRecord(input.orgId, input.issueId);
}

function firstIssueTaskSeq(threadId: string): number | undefined {
  for (const event of useSessionStore.getState().eventsOf(threadId)) {
    if (event.type === 'user' && event.threadSeq !== undefined && isIssueHumanText(event.text)) {
      return event.threadSeq;
    }
  }
  return undefined;
}
