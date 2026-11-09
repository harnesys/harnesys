import {
  type CompactionMessage,
  compactForced,
  type InMemoryRuntimeState,
  type ModelBinding,
  type ModelsPort,
  type RunEventStore,
  type RunTarget,
  rebuildThreadMessages,
  type Snapshot,
  type ToolDefinition,
} from 'harnesys';
import type {
  CompactSkipReason,
  CompactThreadResult,
} from '../../domain/thread/local-executor.port.ts';
import {
  CompactionNotConfiguredException,
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
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

interface CompactOutcome {
  completed: CompactionMessage | undefined;
  failure: string | undefined;
  skipReason: CompactSkipReason | undefined;
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
  const outcome = await runForcedCompact(deps, { threadId, target, binding, mutable, signal });
  const partial = outcomeToCompactResult(outcome, signal);
  if (partial) {
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
  },
): Promise<CompactOutcome> {
  const outcome: CompactOutcome = {
    completed: undefined,
    failure: undefined,
    skipReason: undefined,
  };
  try {
    for await (const event of compactForced({
      agent: input.target.agent,
      state: input.mutable,
      sessionId: input.threadId,
      binding: input.binding,
      models: deps.models,
      toolRegistry: toolRegistryOf(input.target),
      paths: input.target.paths,
      signal: input.signal ?? new AbortController().signal,
    })) {
      if (event.type === 'completed') {
        outcome.completed = event.message;
      } else if (event.type === 'failed') {
        outcome.failure = event.error;
      } else if (event.type === 'skipped' && event.reason !== 'near-threshold') {
        outcome.skipReason = event.reason;
      }
    }
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

async function persistCompact(
  deps: CompactThreadDeps,
  input: {
    threadId: string;
    state: InMemoryRuntimeState;
    snapshot: Snapshot | null;
    mutable: Record<string, unknown>;
    completed: CompactionMessage;
    messageCount: number;
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
  const runId = await resolveCompactRunId(deps.events, input.threadId, input.snapshot?.runId);
  if (!runId) {
    return;
  }
  const boundary = await resolveCompactBoundary(
    deps.events,
    input.threadId,
    input.completed.coveredUntil,
    input.messageCount,
  );
  await deps.events.appendForThread(input.threadId, runId, [
    {
      type: 'compaction',
      id: input.completed.id,
      reason: 'manual',
      coveredFrom: input.completed.coveredFrom,
      coveredUntil: input.completed.coveredUntil,
      tokensBefore: input.completed.stats.tokensBefore,
      tokensAfter: input.completed.stats.tokensAfter,
      summary: input.completed.content,
      ...(boundary ? { coveredUntilRunId: boundary.runId, coveredUntilSeq: boundary.seq } : {}),
    },
  ]);
}

export interface CompactionBoundary {
  runId: string;
  seq: number;
}

export async function resolveCompactBoundary(
  events: RunEventStore,
  threadId: string,
  coveredUntil: number,
  messageCount: number,
): Promise<CompactionBoundary | null> {
  const listed = await events.listByThread(threadId);
  const sources: number[] = [];
  const messages = rebuildThreadMessages(listed, { messageSources: sources });
  if (messages.length !== messageCount) {
    return null;
  }
  if (coveredUntil < 0 || coveredUntil >= sources.length) {
    return null;
  }
  const sourceIndex = sources[coveredUntil];
  if (sourceIndex === undefined || sourceIndex < 0 || sourceIndex >= listed.length) {
    return null;
  }
  const event = listed[sourceIndex];
  if (!event) {
    return null;
  }
  const runId = event.runId ?? '';
  const seq = event.seq;
  if (!runId || typeof seq !== 'number') {
    return null;
  }
  return { runId, seq };
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
