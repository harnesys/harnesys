import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { PendingSessionEvent, SessionEvent } from 'harnesys';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import {
  CREATE_RUN_EVENTS_SQL,
  CREATE_RUNS_SQL,
  CREATE_THREADS_SQL,
} from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { createCompactionCursorPreparer } from './prepare-compaction-cursors.ts';
import { MemoryThreads } from './prepare-org-target.fakes.ts';
import { SqliteRunEventStore } from './sqlite-run-events.adapter.ts';

const ORG_ID = 'org-1';
const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';

function threadRecord(): ThreadRecord {
  const now = new Date().toISOString();
  return {
    id: THREAD_ID,
    orgId: ORG_ID,
    title: 't',
    kind: 'chat',
    autoReplyAgentId: null,
    policy: { version: 2 },
    lastThreadSeq: 0,
    conversationCount: 0,
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

function storeOf(): SqliteRunEventStore {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = OFF');
  sqlite.exec(CREATE_THREADS_SQL);
  sqlite.exec(CREATE_RUNS_SQL);
  sqlite.exec(CREATE_RUN_EVENTS_SQL);
  const at = '2026-11-05T00:00:00.000Z';
  sqlite
    .prepare(
      `INSERT INTO threads (id, org_id, title, created_at, updated_at, last_read_at)
       VALUES (?, ?, 'thread', ?, ?, ?)`,
    )
    .run(THREAD_ID, ORG_ID, at, at, at);
  sqlite
    .prepare(
      `INSERT INTO runs (run_id, thread_id, agent_id, agent_name, status, created_at, updated_at)
       VALUES (?, ?, 'agent-1', 'Coder', 'running', ?, ?)`,
    )
    .run(RUN_ID, THREAD_ID, at, at);
  const threads = new MemoryThreads();
  threads.insert(threadRecord());
  const prepare = createCompactionCursorPreparer({ orgId: ORG_ID, threads });
  return new SqliteRunEventStore(drizzle(sqlite, { schema }), { prepare });
}

function anchorEvent(overrides: Partial<PendingSessionEvent>): PendingSessionEvent {
  return {
    type: 'compaction',
    id: 'c1',
    reason: 'threshold',
    coveredFrom: 0,
    coveredUntil: 1,
    tokensBefore: 10,
    tokensAfter: 2,
    summary: 'fold',
    coveredTotal: 2,
    ...overrides,
  } as PendingSessionEvent;
}

/** Two turns of history plus the anchor, read back the way the next seed sees them. */
async function appendHistory(
  store: SqliteRunEventStore,
  anchor: PendingSessionEvent,
): Promise<SessionEvent[]> {
  store.appendForThread(THREAD_ID, RUN_ID, [
    { type: 'user', text: 'hi' } as PendingSessionEvent,
    { type: 'model.usage', text: 'a', usage: {} } as PendingSessionEvent,
  ]);
  store.appendForThread(THREAD_ID, RUN_ID, [anchor]);
  return store.listByThread(THREAD_ID);
}

function anchorOf(events: SessionEvent[]): SessionEvent & { type: 'compaction' } {
  const anchor = events[events.length - 1];
  if (anchor?.type !== 'compaction') {
    throw new Error('anchor missing');
  }
  return anchor;
}

describe('prepareCompactionCursors', () => {
  test('stamps the cursor of the covered source event onto an auto anchor', async () => {
    const events = await appendHistory(storeOf(), anchorEvent({}));
    const covered = events[1];
    const anchor = anchorOf(events);
    expect(covered?.type).toBe('model.usage');
    expect(anchor.coveredUntilThreadSeq).toBe(covered?.threadSeq);
    expect(anchor.coveredUntilRunId).toBe(RUN_ID);
    expect(anchor.coveredUntilSeq).toBe(covered?.seq);
  });

  test('a replay that diverges from the compacted state is stamped null', async () => {
    const events = await appendHistory(storeOf(), anchorEvent({ coveredTotal: 5 }));
    expect(anchorOf(events).coveredUntilThreadSeq).toBeNull();
  });

  test('an already stamped anchor passes through the hook untouched', async () => {
    const events = await appendHistory(storeOf(), anchorEvent({ coveredUntilThreadSeq: 7 }));
    expect(anchorOf(events).coveredUntilThreadSeq).toBe(7);
  });
});
