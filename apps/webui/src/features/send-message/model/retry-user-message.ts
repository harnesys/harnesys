import type { ThreadAttachment } from '@harnesys/studio-shared';
import { deleteOptimisticUserMessage, deleteUserMessage } from './delete-turn';
import { sendMessage } from './send-message';

interface EditBaseInput {
  threadId: string;
  text: string;
  attachments?: ThreadAttachment[];
  skills?: string[];
}

export interface ReloadUserMessageInput extends EditBaseInput {
  runId: string;
  seq: number;
}

export async function reloadUserMessage(input: ReloadUserMessageInput): Promise<void> {
  const { threadId, runId, seq, text, attachments, skills } = input;
  await deleteUserMessage(threadId, runId, seq);
  await sendMessage({ threadId, content: text, attachments, skills });
}

export interface EditUserMessageInput extends EditBaseInput {
  runId?: string;
  seq?: number;
  clientEventId?: string;
}

export async function editUserMessage(input: EditUserMessageInput): Promise<void> {
  const { threadId, runId, seq, text, attachments, skills, clientEventId } = input;
  if (runId && seq !== undefined) {
    await deleteUserMessage(threadId, runId, seq);
  } else if (clientEventId) {
    deleteOptimisticUserMessage(threadId, clientEventId);
  }
  await sendMessage({ threadId, content: text, attachments, skills });
}
