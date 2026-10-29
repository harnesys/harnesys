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

export interface CompactThreadDeps {
  models: ModelsPort;
  events: RunEventStore;
  seededThreadState: (threadId: string) => Promise<InMemoryRuntimeState>;
  resolveRunTarget: (threadId: string, state: InMemoryRuntimeState) => Promise<RunTarget | null>;
}

export async function compactThread(
  deps: CompactThreadDeps,
  threadId: string,
): Promise<CompactThreadResult> {
  const state = await deps.seededThreadState(threadId);
  const target = await deps.resolveRunTarget(threadId, state);
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
  const { completed, skipReason } = await runForcedCompact(deps, {
    threadId,
    target,
    binding,
    mutable,
  });
  if (!completed) {
    return { compacted: false, ...(skipReason ? { reason: skipReason } : {}) };
  }
  await persistCompact(deps, { threadId, state, snapshot, mutable, completed, messageCount });
  return {
    compacted: true,
    id: completed.id,
    coveredFrom: completed.coveredFrom,
    coveredUntil: completed.coveredUntil,
    tokensBefore: completed.stats.tokensBefore,
    tokensAfter: completed.stats.tokensAfter,
  };
}

async function runForcedCompact(
  deps: CompactThreadDeps,
  input: {
    threadId: string;
    target: RunTarget;
    binding: ModelBinding;
    mutable: Record<string, unknown>;
  },
): Promise<{
  completed: CompactionMessage | undefined;
  skipReason: CompactSkipReason | undefined;
}> {
  let completed: CompactionMessage | undefined;
  let skipReason: CompactSkipReason | undefined;
  let failure: string | undefined;
  try {
    for await (const event of compactForced({
      agent: input.target.agent,
      state: input.mutable,
      sessionId: input.threadId,
      binding: input.binding,
      models: deps.models,
      toolRegistry: toolRegistryOf(input.target),
      paths: input.target.paths,
      signal: new AbortController().signal,
    })) {
      if (event.type === 'completed') {
        completed = event.message;
      } else if (event.type === 'failed') {
        failure = event.error;
      } else if (event.type === 'skipped' && event.reason !== 'near-threshold') {
        skipReason = event.reason;
      }
    }
  } catch (error) {
    if (isCompactionNotConfigured(error)) {
      throw new CompactionNotConfiguredException();
    }
    throw error;
  }
  if (failure) {
    throw new Error(failure);
  }
  return { completed, skipReason };
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
