import type { ThreadAttachment } from '@harnesys/studio-shared';
import { apiJson } from './client';

export interface ThreadQueueItem {
  itemId: string;
  text: string;
  attachments?: ThreadAttachment[];
  origin?: string;
  clientEventId?: string;
  queuedAt: string;
  deliveredAt?: string | null;
}

export interface QueueThreadMessageInput {
  text: string;
  attachments?: ThreadAttachment[];
  origin?: string;
  clientEventId?: string;
}

interface ThreadQueueResponse {
  items: ThreadQueueItem[];
}

function queueBase(threadId: string): string {
  return `/api/threads/${encodeURIComponent(threadId)}/queue`;
}

export function listThreadQueue(threadId: string): Promise<ThreadQueueItem[]> {
  return apiJson<ThreadQueueResponse>(queueBase(threadId)).then((res) => res.items);
}

export function queueThreadMessage(
  threadId: string,
  body: QueueThreadMessageInput,
): Promise<ThreadQueueItem[]> {
  return apiJson<ThreadQueueResponse>(queueBase(threadId), {
    method: 'POST',
    body: JSON.stringify({
      text: body.text,
      clientEventId: body.clientEventId,
      ...(body.attachments?.length ? { attachments: body.attachments } : {}),
      ...(body.origin ? { origin: body.origin } : {}),
    }),
  }).then((res) => res.items);
}

export function deleteThreadQueueItem(threadId: string, itemId: string): Promise<void> {
  return apiJson<void>(`${queueBase(threadId)}/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
}

export function deliverThreadQueueItem(threadId: string, itemId: string): Promise<void> {
  return apiJson<void>(`${queueBase(threadId)}/${encodeURIComponent(itemId)}/deliver`, {
    method: 'POST',
  }).then(() => undefined);
}
