import type { MessageQuote } from '@harnesys/contracts';
import type { ThreadAttachment } from '@harnesys/studio-shared';
import { deleteOptimisticUserMessage, deleteUserMessage } from './delete-turn';
import { sendMessage } from './send-message';

interface EditBaseInput {
  threadId: string;
  text: string;
  attachments?: ThreadAttachment[];
  skills?: string[];
  quote?: MessageQuote;
}

export interface ReloadUserMessageInput extends EditBaseInput {
  threadSeq: number;
}

export async function reloadUserMessage(input: ReloadUserMessageInput): Promise<void> {
  const { threadId, threadSeq, text, attachments, skills, quote } = input;
  await deleteUserMessage(threadId, threadSeq);
  await sendMessage({ threadId, content: text, attachments, skills, quote });
}

export interface EditUserMessageInput extends EditBaseInput {
  threadSeq?: number;
  clientEventId?: string;
}

export async function editUserMessage(input: EditUserMessageInput): Promise<void> {
  const { threadId, threadSeq, text, attachments, skills, clientEventId, quote } = input;
  if (threadSeq !== undefined) {
    await deleteUserMessage(threadId, threadSeq);
  } else if (clientEventId) {
    deleteOptimisticUserMessage(threadId, clientEventId);
  }
  await sendMessage({ threadId, content: text, attachments, skills, quote });
}
