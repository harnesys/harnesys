import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { getActiveOrgId } from '@/shared/api/active-org';
import { ApiError, apiJson } from '@/shared/api/client';
import { getThread } from '@/shared/api/threads';

export interface UndoCompactOptions {
  threadId: string;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

export async function undoCompact(options: UndoCompactOptions): Promise<void> {
  const { threadId } = options;
  try {
    const orgId = getActiveOrgId();
    if (!orgId) {
      throw new ApiError(400, 'No active organization');
    }
    await apiJson<unknown>(`/api/threads/${encodeURIComponent(threadId)}/compact/undo`, {
      method: 'POST',
    });
    useThreadStore.getState().touch(threadId);
    const record = await getThread(threadId);
    useThreadStore.getState().upsert(toClientThread(record));
    useSessionStore.getState().replaceEvents(threadId, record.events);
    options.onDone?.();
  } catch (error) {
    options.onError?.(error);
  }
}
