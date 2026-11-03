import type { ConversationalEventRow } from '../org-sqlite/thread-transcript.store.ts';

export interface GroupWindowMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: unknown[];
}

function userMessage(row: ConversationalEventRow): GroupWindowMessage | null {
  const text = typeof row.metadata.text === 'string' ? row.metadata.text : '';
  const author = row.metadata.author as { displayName?: string } | undefined;
  const attachments = row.metadata.attachments;
  const content = author?.displayName ? `${author.displayName}: ${text}` : text;
  if (!content.trim() && !Array.isArray(attachments)) {
    return null;
  }
  return {
    role: 'user',
    content,
    ...(Array.isArray(attachments) ? { attachments } : {}),
  };
}

function assistantMessage(row: ConversationalEventRow): GroupWindowMessage | null {
  const text = typeof row.metadata.text === 'string' ? row.metadata.text : '';
  return text.trim() ? { role: 'assistant', content: text } : null;
}

export function groupWindowMessages(rows: ConversationalEventRow[]): GroupWindowMessage[] {
  const out: GroupWindowMessage[] = [];
  for (const row of rows) {
    const message = row.type === 'user' ? userMessage(row) : assistantMessage(row);
    if (message) {
      out.push(message);
    }
  }
  return out;
}
