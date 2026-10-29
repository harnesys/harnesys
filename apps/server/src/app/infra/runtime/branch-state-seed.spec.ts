import { Database } from 'bun:sqlite';
import { afterAll, describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { RunEventStore, RunLifecycleStore, RunRecord, SessionEvent, Snapshot } from 'harnesys';
import { RUNTIME_VERSION } from 'harnesys';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { CREATE_RUN_SNAPSHOTS_SQL } from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { createBranchSeed } from './branch-state-seed.ts';
import { MemoryThreads } from './prepare-org-target.fakes.ts';
import { SqliteRuntimeState } from './sqlite-runtime-state.adapter.ts';
import type { ThreadSessionRef } from './wait-ticker.ts';

const ORG_ID = 'org-1';
const THREAD_ID = 'thread-1';

class StubLifecycle implements RunLifecycleStore {
  async get(): Promise<RunRecord | null> {
    return null;
  }
  create(): Promise<RunRecord> {
    throw new Error('not used');
  }
  async activeByThread(): Promise<RunRecord | null> {
    return null;
  }
  async childrenByParent(): Promise<RunRecord[]> {
    return [];
  }
  async claim(): Promise<RunRecord | null> {
    return null;
  }
  transition(): Promise<RunRecord> {
    throw new Error('not used');
  }
  async renewLease(): Promise<boolean> {
    return false;
  }
  async listClaimable(): Promise<RunRecord[]> {
    return [];
  }
  async listDueTimers(): Promise<RunRecord[]> {
    return [];
  }

  async listStaleRunning(): Promise<RunRecord[]> {
    return [];
  }
}

class StubEvents implements RunEventStore {
  constructor(private readonly byThread: SessionEvent[] = []) {}
  next(): number {
    return 1;
  }
  async append(): Promise<SessionEvent[]> {
    throw new Error('not used');
  }
  async tail(): Promise<SessionEvent[]> {
    return [];
  }
  async latestSeq(): Promise<number> {
    return 0;
  }
  async listByThread(): Promise<SessionEvent[]> {
    return this.byThread;
  }
  async hasRun(): Promise<boolean> {
    return false;
  }
  appendForThread(): SessionEvent[] {
    throw new Error('not used');
  }
  async removeUserEvent(): Promise<boolean> {
    return false;
  }
  async truncateThreadFrom(): Promise<{
    cutoff: SessionEvent;
    removedEvents: number;
    removedRunIds: string[];
    remainingUserCount: number;
  }> {
    throw new Error('not used');
  }
  async removeEvent(): Promise<SessionEvent | null> {
    return null;
  }
}

function threadRecord(): ThreadRecord {
  const now = new Date().toISOString();
  return {
    id: THREAD_ID,
    orgId: ORG_ID,
    agentId: 'agent-1',
    originAgentId: 'agent-1',
    title: 't',
    kind: 'chat',
    parentThreadId: null,
    forkAt: null,
    inheritedEventCount: 0,
    metadata: {},
    runProfileId: null,
    runDirectory: null,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
}

function persistedSnapshot(runId: string): Snapshot {
  return {
    sessionId: THREAD_ID,
    runId,
    definitionHash: 'h',
    planHash: 'p',
    sequence: 7,
    status: 'needs_input',
    runtimeVersion: RUNTIME_VERSION,
    initialInput: null,
    state: {
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'sh', args: {} }] },
      ],
    },
    cursor: {
      nodes: { act: { phase: 'executing', nodeExecutionId: `${runId}:act:1` } },
      budget: { steps: 2, tokens: 5, startedAt: 1 },
      interrupt: {
        interruptId: 'perm/1',
        nodeId: 'act',
        source: 'permission',
        reason: 'tool needs approval',
        resumeSchema: { type: 'object', properties: { approved: { type: 'boolean' } } },
      },
    },
  };
}

const sqlite = new Database(':memory:');
sqlite.exec(CREATE_RUN_SNAPSHOTS_SQL);
const db = drizzle(sqlite, { schema });

function seedHarness(events: SessionEvent[], sessions: Map<string, ThreadSessionRef> = new Map()) {
  const threads = new MemoryThreads();
  threads.thread = threadRecord();
  return createBranchSeed({
    orgId: ORG_ID,
    sessions,
    threads,
    events: new StubEvents(events),
    lifecycle: new StubLifecycle(),
    stateFactory: (threadId, runId) => new SqliteRuntimeState(threadId, runId, db),
  });
}

describe('branch-state-seed', () => {
  afterAll(() => sqlite.close());

  test('run seed binds the replayed state to the actual run id', async () => {
    const events: SessionEvent[] = [{ type: 'user', text: 'hi', seq: 1, runId: 'run-1' }];
    const state = await seedHarness(events).seededRunState(THREAD_ID, 'run-1');
    const snap = await state.load();
    expect(snap?.runId).toBe('run-1');
    expect(snap?.state.messages).toEqual([{ role: 'user', content: 'hi' }]);
    const row = sqlite.query('SELECT COUNT(*) AS c FROM run_snapshots').get() as { c: number };
    expect(row.c).toBe(0);
  });

  test('run seed hydrates the persisted run snapshot instead of replaying the journal', async () => {
    const writer = new SqliteRuntimeState(THREAD_ID, 'run-2', db);
    await writer.commit(persistedSnapshot('run-2'), [], {
      kind: 'recorded',
      sequence: persistedSnapshot('run-2').sequence,
    });
    const events: SessionEvent[] = [{ type: 'user', text: 'hi', seq: 1, runId: 'run-2' }];
    const state = await seedHarness(events).seededRunState(THREAD_ID, 'run-2');
    const snap = await state.load();
    expect(snap?.status).toBe('needs_input');
    expect(snap?.sequence).toBe(7);
    expect(snap?.cursor.interrupt?.interruptId).toBe('perm/1');
  });

  test('thread seed without run binding keeps a fresh run id', async () => {
    const events: SessionEvent[] = [{ type: 'user', text: 'hi', seq: 1, runId: 'run-3' }];
    const state = await seedHarness(events).seededThreadState(THREAD_ID);
    const snap = await state.load();
    expect(snap?.runId).not.toBe('run-3');
    expect(snap?.state.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  test('a cached empty session is re-seeded once the journal has events', async () => {
    const sessions = new Map<string, ThreadSessionRef>();
    const journal: SessionEvent[] = [];
    const seed = seedHarness(journal, sessions);
    const first = await seed.seededThreadState(THREAD_ID);
    const emptySnap = await first.load();
    expect(emptySnap).toBeNull();
    journal.push({ type: 'user', text: 'hi', seq: 1, runId: 'run-4' });
    const second = await seed.seededThreadState(THREAD_ID);
    expect(second).toBe(first);
    const snap = await second.load();
    expect(snap?.state.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
