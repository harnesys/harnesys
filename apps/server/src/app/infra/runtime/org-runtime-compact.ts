import {
  type CompactionMessage,
  type CompactionPassEvent,
  compactForced,
  type InMemoryRuntimeState,
  type ModelBinding,
  type ModelsPort,
  type PendingSessionEvent,
  type RunEventStore,
  type RunTarget,
  type Snapshot,
  type ToolDefinition,
} from 'harnesys';
import type { CompactThreadResult } from '../../domain/thread/local-executor.port.ts';
import {
  CompactionNotConfiguredException,
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type { CompactOutcome, CompactProgressSink } from './org-runtime-compact-progress.ts';
import { closeUnfinishedProgress, createProgressAppender } from './org-runtime-compact-progress.ts';
import type { RunTargetSelector } from './org-runtime-run-target.ts';

export interface CompactThreadDeps {
  models: ModelsPort;
  events: RunEventStore;
  agentId: string | undefined;
  seededThreadState: (threadId: string) => Promise<InMemoryRuntimeState>;
  resolveRunTarget: (
    threadId: string,
    state: InMemoryRuntimeState,
    selector?: RunTargetSelector,
  ) => Promise<RunTarget | null>;
}

const CANCELLED: CompactThreadResult = { compacted: false, reason: 'cancelled' };

export async function compactThread(
  deps: CompactThreadDeps,
  threadId: string,
  signal?: AbortSignal,
): Promise<CompactThreadResult> {
  const state = await deps.seededThreadState(threadId);
  const target = await deps.resolveRunTarget(threadId, state, { agentId: deps.agentId });
  if (!target) {
    throw new ThreadNotFoundException(threadId);
  }
  const model = target.agent.model;
  if (!model) {
    throw new ThreadValidationException('agent has no model');
  }
  const binding = await deps.models.get(model.provider, model.model);
  const snapshot = await state.load();
  const mutable = mutableStateOf(snapshot);
  const messageCount = Array.isArray(mutable.messages) ? mutable.messages.length : -1;
  const runId = await resolveCompactRunId(deps.events, threadId, snapshot?.runId);
  const progress = createProgressAppender(deps, threadId, runId);
  const outcome = await runForcedCompact(deps, {
    threadId,
    target,
    binding,
    mutable,
    signal,
    progress,
  });
  const partial = outcomeToCompactResult(outcome, signal);
  if (partial) {
    await closeUnfinishedProgress(outcome, signal, progress);
    return partial;
  }
  const completed = outcome.completed as CompactionMessage;
  await persistCompact(deps, {
    threadId,
    state,
    snapshot,
    mutable,
    completed,
    messageCount,
    runId,
  });
  return {
    compacted: true,
    id: completed.id,
    coveredFrom: completed.coveredFrom,
    coveredUntil: completed.coveredUntil,
    tokensBefore: completed.stats.tokensBefore,
    tokensAfter: completed.stats.tokensAfter,
  };
}

/** null means the pass completed and the caller should persist the anchor. */
function outcomeToCompactResult(
  outcome: CompactOutcome,
  signal?: AbortSignal,
): CompactThreadResult | null {
  const aborted = signal?.aborted ?? false;
  if (outcome.completed && !aborted) {
    return null;
  }
  if (aborted || outcome.completed) {
    return CANCELLED;
  }
  if (outcome.failure) {
    throw new Error(outcome.failure);
  }
  return { compacted: false, ...(outcome.skipReason ? { reason: outcome.skipReason } : {}) };
}

async function runForcedCompact(
  deps: CompactThreadDeps,
  input: {
    threadId: string;
    target: RunTarget;
    binding: ModelBinding;
    mutable: Record<string, unknown>;
    signal?: AbortSignal;
    progress: CompactProgressSink;
  },
): Promise<CompactOutcome> {
  const outcome: CompactOutcome = {
    completed: undefined,
    failure: undefined,
    skipReason: undefined,
    startedId: undefined,
  };
  try {
    const pass = compactForced({
      agent: input.target.agent,
      state: input.mutable,
      sessionId: input.threadId,
      binding: input.binding,
      models: deps.models,
      toolRegistry: toolRegistryOf(input.target),
      paths: input.target.paths,
      signal: input.signal ?? new AbortController().signal,
    });
    await drainCompactPass(pass, outcome, input.progress);
  } catch (error) {
    if (isCompactionNotConfigured(error)) {
      throw new CompactionNotConfiguredException();
    }
    if (input.signal?.aborted) {
      return outcome;
    }
    throw error;
  }
  return outcome;
}

async function drainCompactPass(
  pass: AsyncGenerator<CompactionPassEvent>,
  outcome: CompactOutcome,
  progress: CompactProgressSink,
): Promise<void> {
  for await (const event of pass) {
    if (event.type === 'started') {
      outcome.startedId = event.id;
      await progress({
        phase: 'started',
        id: event.id,
        coveredFrom: event.coveredFrom,
        coveredUntil: event.coveredUntil,
      });
    } else if (event.type === 'completed') {
      outcome.completed = event.message;
    } else if (event.type === 'failed') {
      outcome.failure = event.error;
      if (outcome.startedId !== undefined) {
        await progress({ phase: 'failed', id: outcome.startedId, message: event.error });
      }
    } else if (event.type === 'skipped' && event.reason !== 'near-threshold') {
      outcome.skipReason = event.reason;
    }
  }
}

async function persistCompact(
  deps: CompactThreadDeps,
  input: {
    threadId: string;
    state: InMemoryRuntimeState;
    snapshot: Snapshot | null;
    mutable: Record<string, unknown>;
    completed: CompactionMessage;
    messageCount: number;
    runId: string | undefined;
  },
): Promise<void> {
  const sequence = (input.snapshot?.sequence ?? 0) + 1;
  await input.state.commit(
    {
      sessionId: input.snapshot?.sessionId ?? input.threadId,
      runId: input.snapshot?.runId ?? crypto.randomUUID(),
      definitionHash: input.snapshot?.definitionHash ?? '',
      planHash: input.snapshot?.planHash ?? '',
      sequence,
      status: input.snapshot?.status ?? 'idle',
      runtimeVersion: input.snapshot?.runtimeVersion ?? 'compact',
      initialInput: input.snapshot?.initialInput ?? null,
      state: input.mutable,
      cursor: input.snapshot?.cursor ?? { nodes: {} },
    },
    [],
    { kind: 'recorded', sequence },
  );
  const runId = input.runId;
  if (!runId) {
    return;
  }
  await deps.events.appendForThread(input.threadId, runId, [
    manualAnchorEvent(input.completed, input.messageCount),
  ]);
}

export function manualAnchorEvent(
  completed: CompactionMessage,
  messageCount: number,
): PendingSessionEvent {
  const boundary =
    completed.coveredUntilRunId !== undefined && completed.coveredUntilSeq !== undefined
      ? { runId: completed.coveredUntilRunId, seq: completed.coveredUntilSeq }
      : null;
  const cursor: Partial<Extract<PendingSessionEvent, { type: 'compaction' }>> = {};
  if (completed.durable === false) {
    cursor.durable = false;
    if (completed.unresolvedReason !== undefined) {
      cursor.unresolvedReason = completed.unresolvedReason;
    }
  } else if (boundary) {
    cursor.coveredUntilRunId = boundary.runId;
    cursor.coveredUntilSeq = boundary.seq;
    if (completed.coveredKind !== undefined) {
      cursor.coveredKind = completed.coveredKind;
    }
    if (completed.coveredToolCallId !== undefined) {
      cursor.coveredToolCallId = completed.coveredToolCallId;
    }
  } else {
    cursor.durable = false;
    cursor.unresolvedReason =
      completed.coveredUntilEngSeq !== undefined ? 'eng-seq-not-replayable' : 'no-sourced-boundary';
  }
  return {
    type: 'compaction',
    id: completed.id,
    reason: 'manual',
    coveredFrom: completed.coveredFrom,
    coveredUntil: completed.coveredUntil,
    tokensBefore: completed.stats.tokensBefore,
    tokensAfter: completed.stats.tokensAfter,
    summary: completed.content,
    coveredTotal: messageCount,
    ...cursor,
  } as PendingSessionEvent;
}

function mutableStateOf(snapshot: Snapshot | null): Record<string, unknown> {
  const mutable: Record<string, unknown> = snapshot
    ? { ...(snapshot.state as Record<string, unknown>) }
    : { messages: [] };
  mutable.messages = Array.isArray(mutable.messages) ? [...mutable.messages] : [];
  return mutable;
}

function toolRegistryOf(target: RunTarget): Map<string, ToolDefinition> {
  const registry = target.capabilitySet?.registry;
  if (!registry) {
    return new Map();
  }
  return new Map(
    [...registry].map(([name, entry]) => [name, { ...entry.def, exposure: entry.exposure }]),
  );
}

export async function resolveCompactRunId(
  events: RunEventStore,
  threadId: string,
  fallback: string | undefined,
): Promise<string | undefined> {
  if (fallback && (await events.hasRun(fallback))) {
    return fallback;
  }
  const listed = await events.listByThread(threadId);
  for (let index = listed.length - 1; index >= 0; index -= 1) {
    const runId = listed[index]?.runId;
    if (typeof runId === 'string' && runId.length > 0) {
      return runId;
    }
  }
  return undefined;
}

function isCompactionNotConfigured(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'compaction_not_configured'
  );
}
