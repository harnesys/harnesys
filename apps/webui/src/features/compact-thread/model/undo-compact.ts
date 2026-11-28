import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { refreshThread } from '@/features/desk/model/refresh-thread';
import { toStudioSummary, undoThreadCompact } from '@/shared/api';

export interface UndoCompactOptions {
  threadId: string;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

export async function undoCompact(options: UndoCompactOptions): Promise<void> {
  const { threadId } = options;
  try {
    const response = await undoThreadCompact(threadId);
    useThreadStore.getState().touch(threadId);
    useThreadStore.getState().upsert(toClientThread(toStudioSummary(response.summary)));
    const session = useSessionStore.getState();
    session.setHistoryCursor(threadId, response.cursor);
    session.applyDeletions(threadId, [
      { from: response.removedThreadSeq, to: response.removedThreadSeq },
    ]);
    await refreshThread(threadId, { force: true });
    options.onDone?.();
  } catch (error) {
    options.onError?.(error);
  }
}
