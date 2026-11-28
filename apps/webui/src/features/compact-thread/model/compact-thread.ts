import {
  COMPACT_FAILED_FALLBACK,
  type CompactThreadResponse,
  type CompactThreadSkipReason,
} from '@harnesys/studio-shared';
import { useThreadStore } from '@/entities/thread';
import { refreshThread } from '@/features/desk/model/refresh-thread';
import { compactThreadStream, readSse } from '@/shared/api';
import { useCompactingStore } from './compacting.store';
export interface CompactThreadOptions {
  threadId: string;
}
export interface CompactThreadResult {
  compacted: boolean;
  reason?: CompactThreadSkipReason;
}
export async function compactThread(options: CompactThreadOptions): Promise<CompactThreadResult> {
  const { threadId } = options;
  const controller = new AbortController();
  if (!useCompactingStore.getState().begin(threadId, controller)) {
    return { compacted: false, reason: 'compaction-in-progress' };
  }
  let result: CompactThreadResponse = { compacted: false };
  try {
    const response = await compactThreadStream(threadId, controller.signal);
    for await (const frame of readSse(response)) {
      if (frame.event === 'compact.accepted') {
        void refreshThread(threadId, { force: true });
        continue;
      }
      if (frame.event === 'compact.result') {
        result = JSON.parse(frame.data) as CompactThreadResponse;
        continue;
      }
      if (frame.event === 'error') {
        const body = JSON.parse(frame.data) as {
          message?: string;
        };
        throw new Error(body.message || COMPACT_FAILED_FALLBACK);
      }
    }
    useThreadStore.getState().touch(threadId);
    try {
      await refreshThread(threadId, { force: true });
    } catch {}
    return result.compacted
      ? { compacted: true }
      : { compacted: false, ...(result.reason ? { reason: result.reason } : {}) };
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      return { compacted: false, reason: 'cancelled' };
    }
    throw error;
  } finally {
    useCompactingStore.getState().end(threadId);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
