import type { CompactionMessage, PendingSessionEvent } from 'harnesys';
import type { CompactSkipReason } from '../../domain/thread/local-executor.port.ts';
import type { CompactThreadDeps } from './org-runtime-compact.ts';

export interface CompactOutcome {
  completed: CompactionMessage | undefined;
  failure: string | undefined;
  skipReason: CompactSkipReason | undefined;
  startedId: string | undefined;
}

export type CompactProgress =
  | {
      phase: 'started';
      id: string;
      coveredFrom: number;
      coveredUntil: number;
    }
  | { phase: 'failed' | 'cancelled'; id: string; message: string };

export type CompactProgressSink = (progress: CompactProgress) => Promise<void>;

/**
 * A started marker with no anchor and no failure means the pass was cancelled
 * (or died with the host): the journal keeps it open, so close it here.
 */
export async function closeUnfinishedProgress(
  outcome: CompactOutcome,
  signal: AbortSignal | undefined,
  progress: CompactProgressSink,
): Promise<void> {
  const id = outcome.startedId;
  if (id === undefined || outcome.failure || !signal?.aborted) {
    return;
  }
  await progress({ phase: 'cancelled', id, message: 'compaction cancelled' });
}

export function createProgressAppender(
  deps: CompactThreadDeps,
  threadId: string,
  runId: string | undefined,
): CompactProgressSink {
  return async (progress) => {
    if (!runId) {
      return;
    }
    await deps.events.appendForThread(threadId, runId, [progressEvent(progress)]);
  };
}

function progressEvent(progress: CompactProgress): PendingSessionEvent {
  return {
    type: 'compaction.progress',
    id: progress.id,
    phase: progress.phase,
    reason: 'manual',
    ...(progress.phase === 'started'
      ? { coveredFrom: progress.coveredFrom, coveredUntil: progress.coveredUntil }
      : { message: progress.message }),
  } as PendingSessionEvent;
}
