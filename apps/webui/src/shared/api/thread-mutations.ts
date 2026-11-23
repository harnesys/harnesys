import type { DeleteThreadEventResponse, UndoCompactResponse } from '@harnesys/contracts';
import { apiJson } from './client';
import { requireOrgId, threadsBase } from './threads';

export function deleteThreadUserEvent(
  threadId: string,
  threadSeq: number,
): Promise<DeleteThreadEventResponse> {
  const orgId = requireOrgId();
  return apiJson<DeleteThreadEventResponse>(
    `${threadsBase(orgId)}/${encodeURIComponent(threadId)}/events/${encodeURIComponent(String(threadSeq))}`,
    { method: 'DELETE' },
  );
}

export function undoThreadCompact(threadId: string): Promise<UndoCompactResponse> {
  return apiJson<UndoCompactResponse>(`/api/threads/${encodeURIComponent(threadId)}/compact/undo`, {
    method: 'POST',
  });
}
