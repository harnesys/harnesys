import type { RunLifecycleStore } from 'harnesys';
import { primaryAgentIdOf } from '../../application/threads/thread.helpers.ts';
import type { CompactThreadResult } from '../../domain/thread/local-executor.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { CompactThreadDeps } from './org-runtime-compact.ts';
import { compactThread } from './org-runtime-compact.ts';

export function runOrgCompact(
  deps: Omit<CompactThreadDeps, 'agentId' | 'activeRunIdOf'> & {
    lifecycle: RunLifecycleStore;
    threadAgentIds: (threadId: string) => string[];
    findThreadRecord: (threadId: string) => ThreadRecord | undefined;
  },
  threadId: string,
  signal: AbortSignal,
): Promise<CompactThreadResult> {
  const thread = deps.findThreadRecord(threadId);
  return compactThread(
    {
      models: deps.models,
      events: deps.events,
      agentId:
        thread === undefined ? undefined : primaryAgentIdOf(thread, deps.threadAgentIds(threadId)),
      seededThreadState: deps.seededThreadState,
      resolveRunTarget: deps.resolveRunTarget,
      findThread: deps.findThread,
      activeRunIdOf: (id) =>
        deps.lifecycle
          .activeByThread(id)
          .then((record) => record?.runId ?? null)
          .catch(() => null),
    },
    threadId,
    signal,
  );
}
