import type { CompactThreadResponse } from '@harnesys/studio-shared';
import { useSessionStore } from '@/entities/session';
import { toClientThread, useThreadStore } from '@/entities/thread';
import { compactThreadStream, getThread, readSse } from '@/shared/api';
import { useCompactingStore } from './compacting.store';
export interface CompactThreadOptions {
  threadId: string;
}
export interface CompactThreadResult {
  compacted: boolean;
  reason?:
    | 'no-context-window'
    | 'invalid-output-reserve'
    | 'empty-history'
    | 'resume-pending'
    | 'already-covered'
    | 'no-cut-plan'
    | 'hook-blocked'
    | 'empty-window'
    | 'breaker-open'
    | 'rapid-refill'
    | 'compaction-in-progress'
    | 'cancelled';
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
      if (frame.event === 'compact.result') {
        result = JSON.parse(frame.data) as CompactThreadResponse;
        continue;
      }
      if (frame.event === 'error') {
        const body = JSON.parse(frame.data) as {
          message?: string;
        };
        throw new Error(body.message || 'Compact failed');
      }
    }
    useThreadStore.getState().touch(threadId);
    try {
      const record = await getThread(threadId);
      useThreadStore.getState().upsert(toClientThread(record));
      useSessionStore.getState().reconcileEvents(threadId, record.events);
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
