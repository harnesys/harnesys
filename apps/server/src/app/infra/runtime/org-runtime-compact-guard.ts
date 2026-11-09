import type { SessionEvent } from 'harnesys';
import type { CompactThreadResult } from '../../domain/thread/local-executor.port.ts';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';

export interface OrgCompactGuard {
  compact(threadId: string, signal?: AbortSignal): Promise<CompactThreadResult>;
  cancelCompact(threadId: string): Promise<boolean>;
  undoThreadCompact(threadId: string): Promise<SessionEvent>;
}

export interface OrgCompactGuardDeps {
  runCompact(threadId: string, signal: AbortSignal): Promise<CompactThreadResult>;
  undo(threadId: string): Promise<SessionEvent>;
}

/** Serializes manual compactions per thread and carries cancel signals. */
export function createOrgCompactGuard(deps: OrgCompactGuardDeps): OrgCompactGuard {
  const inflight = new Map<string, AbortController>();
  return {
    async compact(threadId, signal) {
      const existing = inflight.get(threadId);
      if (existing && !existing.signal.aborted) {
        return { compacted: false, reason: 'compaction-in-progress' };
      }
      const controller = new AbortController();
      inflight.set(threadId, controller);
      try {
        if (signal) {
          pipeAbort(signal, controller);
        }
        return await deps.runCompact(threadId, controller.signal);
      } finally {
        inflight.delete(threadId);
      }
    },
    cancelCompact: async (threadId) => {
      const existing = inflight.get(threadId);
      if (!existing) {
        return false;
      }
      existing.abort();
      return true;
    },
    undoThreadCompact: (threadId) => {
      if (inflight.has(threadId)) {
        throw new ThreadValidationException('compaction is still in progress');
      }
      return deps.undo(threadId);
    },
  };
}

function pipeAbort(source: AbortSignal, target: AbortController): void {
  if (source.aborted) {
    target.abort();
    return;
  }
  source.addEventListener('abort', () => target.abort(), { once: true });
}
