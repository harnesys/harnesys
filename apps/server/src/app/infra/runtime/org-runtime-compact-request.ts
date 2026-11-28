import type { CompactionOutcome, RunLifecycleStore } from 'harnesys';
import { COMPACTION_NOT_CONFIGURED_CODE } from 'harnesys';
import { primaryAgentIdOf } from '../../application/threads/thread.helpers.ts';
import type { CompactThreadResult } from '../../domain/thread/local-executor.port.ts';
import {
  CompactionNotConfiguredException,
  ThreadNotFoundException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import type { OrgRuntimeDeps } from './org-runtime.types.ts';
import type { CompactionChannel } from './org-runtime-compaction-channel.ts';

export interface CompactRequestDeps {
  channel: CompactionChannel;
  lifecycle: Pick<RunLifecycleStore, 'activeByThread' | 'create'>;
  threadAgentIds: (threadId: string) => string[];
  findThreadRecord: (threadId: string) => ThreadRecord | undefined;
  agentNameOf: (agentId: string) => string | undefined;
  kick: () => void;
}

export function compactRequestDepsOf(
  deps: OrgRuntimeDeps,
  channel: CompactionChannel,
  lifecycle: RunLifecycleStore,
  kick: () => void,
): CompactRequestDeps {
  return {
    channel,
    lifecycle,
    threadAgentIds: (id) =>
      deps.threadAgents.listByThread(deps.orgId, id).map((row) => row.agentId),
    findThreadRecord: (id) => deps.threads.findById(deps.orgId, id),
    agentNameOf: (agentId) => deps.agents.findById(deps.orgId, agentId)?.name,
    kick,
  };
}

export async function requestThreadCompact(
  deps: CompactRequestDeps,
  threadId: string,
  signal: AbortSignal,
  onRun?: (runId: string) => void,
): Promise<CompactThreadResult> {
  if (deps.channel.hasPending(threadId)) {
    return { compacted: false, reason: 'compaction-in-progress' };
  }
  const active = await deps.lifecycle.activeByThread(threadId);
  if (active && (active.status === 'needs_input' || active.status === 'waiting')) {
    return { compacted: false, reason: 'run-paused' };
  }
  const requestId = crypto.randomUUID();
  const runId = active ? active.runId : await createCompactRun(deps, threadId);
  await deps.channel.enqueue({ requestId, threadId, targetRunId: runId });
  onRun?.(runId);
  deps.kick();
  const outcome = await deps.channel.awaitOutcome(requestId, signal);
  if (!outcome.compacted && outcome.reason === 'cancelled') {
    await deps.channel.withdraw(requestId);
  }
  return toCompactResult(outcome);
}

async function createCompactRun(deps: CompactRequestDeps, threadId: string): Promise<string> {
  const thread = deps.findThreadRecord(threadId);
  if (!thread) {
    throw new ThreadNotFoundException(threadId);
  }
  const agentId = primaryAgentIdOf(thread, deps.threadAgentIds(threadId));
  if (!agentId) {
    throw new ThreadNotFoundException(threadId);
  }
  const runId = crypto.randomUUID();
  await deps.lifecycle.create(
    {
      runId,
      threadId,
      agentId,
      agentName: deps.agentNameOf(agentId) ?? agentId,
      purpose: 'compact',
    },
    [],
  );
  return runId;
}

function toCompactResult(outcome: CompactionOutcome): CompactThreadResult {
  if (outcome.compacted) {
    return outcome;
  }
  if (outcome.code === COMPACTION_NOT_CONFIGURED_CODE) {
    throw new CompactionNotConfiguredException();
  }
  if (outcome.error !== undefined) {
    throw new Error(outcome.error);
  }
  return { compacted: false, ...(outcome.reason ? { reason: outcome.reason } : {}) };
}
