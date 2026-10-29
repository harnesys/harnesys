import type { RunEventStore, RunLifecycleStore, RuntimeState } from 'harnesys';
import { InMemoryRuntimeState, rebuildThreadMessages } from 'harnesys';
import { collectInheritedEvents, seedMessagesFromEvents } from '../../domain/thread/fork-logs.ts';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { ThreadSessionRef } from './wait-ticker.ts';

export interface BranchSeedDeps {
  orgId: string;
  sessions: Map<string, ThreadSessionRef>;
  threads: ThreadRepositoryPort;
  events: RunEventStore;
  lifecycle: RunLifecycleStore;
  stateFactory?: (threadId: string, runId: string | null) => InMemoryRuntimeState;
}

export function createBranchSeed(deps: BranchSeedDeps) {
  const stateOf = (threadId: string): InMemoryRuntimeState =>
    deps.stateFactory?.(threadId, null) ?? new InMemoryRuntimeState(threadId);
  return {
    seededThreadState(threadId: string): Promise<InMemoryRuntimeState> {
      const existing = deps.sessions.get(threadId);
      if (existing) {
        return reseedIfEmpty(threadId, existing.state);
      }
      const state = stateOf(threadId);
      deps.sessions.set(threadId, { state });
      return seedBranchState(threadId, state, null).then(() => state);
    },
    seededRunState(threadId: string, runId: string | null): Promise<InMemoryRuntimeState> {
      const state = deps.stateFactory?.(threadId, runId) ?? new InMemoryRuntimeState(threadId);
      return seedBranchState(threadId, state, runId).then(() => state);
    },
    seedBranchState(threadId: string, state: RuntimeState): Promise<void> {
      return seedBranchState(threadId, state, null);
    },
  };

  function reseedIfEmpty(
    threadId: string,
    state: InMemoryRuntimeState,
  ): Promise<InMemoryRuntimeState> {
    return state.load().then((snapshot) => {
      if (snapshot !== null) {
        return state;
      }
      return seedBranchState(threadId, state, null).then(() => state);
    });
  }

  async function seedBranchState(
    threadId: string,
    state: RuntimeState,
    runId: string | null,
  ): Promise<void> {
    if ((await state.load()) !== null) {
      return;
    }
    const thread = deps.threads.findById(deps.orgId, threadId);
    if (!thread) {
      return;
    }
    if (thread.parentThreadId && thread.forkAt) {
      await seedForkState(threadId, state, thread.parentThreadId, thread.forkAt);
      return;
    }
    await seedReplayState(threadId, state, runId);
  }

  async function seedForkState(
    threadId: string,
    state: RuntimeState,
    parentThreadId: string,
    forkAt: string,
  ): Promise<void> {
    const inherited = await collectInheritedEvents(
      (id) => deps.events.listByThread(id),
      (id) => deps.threads.findById(deps.orgId, id),
      { id: threadId, parentThreadId, forkAt },
    );
    const messages = seedMessagesFromEvents(inherited);
    if (messages.length === 0) {
      return;
    }
    await commitSeed(state, messages, null);
  }

  async function seedReplayState(
    threadId: string,
    state: RuntimeState,
    runId: string | null,
  ): Promise<void> {
    const active = await deps.lifecycle.activeByThread(threadId).catch(() => null);
    const events = await deps.events.listByThread(threadId);
    const messages = rebuildThreadMessages(events, { activeRunId: active?.runId ?? null });
    if (messages.length === 0 && runId === null) {
      return;
    }
    await commitSeed(state, messages, runId);
  }

  async function commitSeed(
    state: RuntimeState,
    messages: unknown[],
    runId: string | null,
  ): Promise<void> {
    await state.commit(
      {
        sessionId: state.sessionId,
        runId: runId ?? crypto.randomUUID(),
        definitionHash: '',
        planHash: '',
        sequence: 0,
        status: 'idle',
        runtimeVersion: 'seed',
        initialInput: null,
        state: { messages },
        cursor: { nodes: {} },
      },
      [],
      { kind: 'recorded', sequence: 0 },
    );
  }
}
