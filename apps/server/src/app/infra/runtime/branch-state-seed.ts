import type { RunEventStore, RunLifecycleStore, RuntimeState } from 'harnesys';
import { InMemoryRuntimeState, rebuildThreadMessages } from 'harnesys';
import { collectInheritedEvents, seedMessagesFromEvents } from '../../domain/thread/fork-logs.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { contextWindowOf } from '../../domain/thread/thread-policy.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { latestDeliveredThreadMessage } from '../org-sqlite/thread-message-queue.store.ts';
import { listConversationalBefore } from '../org-sqlite/thread-transcript.store.ts';
import { groupWindowMessages } from './group-window.ts';
import { threadSessionKey } from './thread-session-key.ts';
import type { ThreadSessionRef } from './wait-ticker.ts';

export interface BranchSeedDeps {
  orgId: string;
  db?: OrgSqliteDb;
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
    seededThreadState(threadId: string, agentId?: string): Promise<InMemoryRuntimeState> {
      const key = threadSessionKey(threadId, agentId);
      const existing = deps.sessions.get(key);
      if (existing) {
        return reseedIfEmpty(threadId, existing.state, agentId);
      }
      const state = stateOf(threadId);
      deps.sessions.set(key, { state });
      return seedBranchState(threadId, state, null, agentId).then(() => state);
    },
    seededRunState(
      threadId: string,
      runId: string | null,
      agentId?: string,
    ): Promise<InMemoryRuntimeState> {
      const state = deps.stateFactory?.(threadId, runId) ?? new InMemoryRuntimeState(threadId);
      return seedBranchState(threadId, state, runId, agentId).then(() => state);
    },
    seedBranchState(threadId: string, state: RuntimeState, agentId?: string): Promise<void> {
      return seedBranchState(threadId, state, null, agentId);
    },
  };

  function reseedIfEmpty(
    threadId: string,
    state: InMemoryRuntimeState,
    agentId?: string,
  ): Promise<InMemoryRuntimeState> {
    return state.load().then((snapshot) => {
      if (snapshot !== null) {
        return state;
      }
      return seedBranchState(threadId, state, null, agentId).then(() => state);
    });
  }

  async function seedBranchState(
    threadId: string,
    state: RuntimeState,
    runId: string | null,
    agentId?: string,
  ): Promise<void> {
    if ((await state.load()) !== null) {
      return;
    }
    const thread = deps.threads.findById(deps.orgId, threadId);
    if (!thread) {
      return;
    }
    if (thread.kind === 'group') {
      await seedGroupState(thread, state, runId, agentId);
      return;
    }
    if (thread.parentThreadId && thread.forkAt) {
      await seedForkState(threadId, state, thread.parentThreadId, thread.forkAt);
      return;
    }
    await seedReplayState(threadId, state, runId);
  }

  async function seedGroupState(
    thread: ThreadRecord,
    state: RuntimeState,
    runId: string | null,
    agentId?: string,
  ): Promise<void> {
    if (!deps.db) {
      return;
    }
    const db = deps.db;
    const trigger = agentId ? latestDeliveredThreadMessage(db, thread.id, agentId) : null;
    const before = trigger?.threadSeq ?? thread.lastThreadSeq + 1;
    const rows = listConversationalBefore(db, thread.id, before, contextWindowOf(thread.policy));
    const messages = groupWindowMessages(rows);
    const initialInput = trigger
      ? {
          text: trigger.text,
          ...(trigger.attachments && trigger.attachments.length > 0
            ? { attachments: trigger.attachments }
            : {}),
        }
      : null;
    if (messages.length === 0 && initialInput === null) {
      return;
    }
    await commitSeed(state, messages, runId, initialInput);
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
    await commitSeed(state, messages, null, null);
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
    await commitSeed(state, messages, runId, null);
  }

  async function commitSeed(
    state: RuntimeState,
    messages: unknown[],
    runId: string | null,
    initialInput: unknown,
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
        initialInput,
        state: { messages },
        cursor: { nodes: {} },
      },
      [],
      { kind: 'recorded', sequence: 0 },
    );
  }
}
