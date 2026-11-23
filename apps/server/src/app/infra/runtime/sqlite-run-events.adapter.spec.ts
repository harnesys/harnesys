import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { PendingSessionEvent } from 'harnesys';
import {
  CREATE_RUN_EVENTS_SQL,
  CREATE_RUNS_SQL,
  CREATE_THREAD_LOG_DELETIONS_SQL,
  CREATE_THREADS_SQL,
} from '../org-sqlite/org-sql.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { SqliteRunEventStore } from './sqlite-run-events.adapter.ts';

const PARENT_AGENT_ID = 'genie-agent';
const DELEGATE_ID = 'delegate-agent';
const THREAD_ID = 'thread-1';
const RUN_ID = 'run-1';

function storeOf(): SqliteRunEventStore {
  return storeWithDbOf().store;
}

function storeWithDbOf(): { store: SqliteRunEventStore; db: Database } {
  const sqlite = new Database(':memory:');
  sqlite.exec('PRAGMA foreign_keys = OFF');
  sqlite.exec(CREATE_THREADS_SQL);
  sqlite.exec(CREATE_RUNS_SQL);
  sqlite.exec(CREATE_RUN_EVENTS_SQL);
  sqlite.exec(CREATE_THREAD_LOG_DELETIONS_SQL);
  sqlite
    .prepare(
      `INSERT INTO threads (id, org_id, title, created_at, updated_at, last_read_at)
       VALUES (?, 'org-1', 'thread', ?, ?, ?)`,
    )
    .run(
      THREAD_ID,
      '2026-11-05T00:00:00.000Z',
      '2026-11-05T00:00:00.000Z',
      '2026-11-05T00:00:00.000Z',
    );
  sqlite
    .prepare(
      `INSERT INTO runs (run_id, thread_id, agent_id, agent_name, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Genie', 'running', ?, ?)`,
    )
    .run(
      RUN_ID,
      THREAD_ID,
      PARENT_AGENT_ID,
      '2026-11-05T00:00:00.000Z',
      '2026-11-05T00:00:00.000Z',
    );
  return { store: new SqliteRunEventStore(drizzle(sqlite, { schema })), db: sqlite };
}

describe('SqliteRunEventStore agent events', () => {
  test('keeps the delegate agentId of agent.failed instead of the run agent', () => {
    const store = storeOf();
    const pending: PendingSessionEvent = {
      type: 'agent.failed',
      agentId: DELEGATE_ID,
      spawnId: 'spawn-1',
      code: 'unknown_path',
      message: 'boom',
    } as PendingSessionEvent;
    const [stored] = store.appendForThread(THREAD_ID, RUN_ID, [pending]);
    expect(stored?.agentId).toBe(DELEGATE_ID);
  });

  test('keeps the delegate agentName of agent.completed when read back', async () => {
    const store = storeOf();
    const pending = {
      type: 'agent.completed',
      agentId: DELEGATE_ID,
      agentName: 'Spawn Tester 1',
      spawnId: 'spawn-1',
    } as PendingSessionEvent;
    store.appendForThread(THREAD_ID, RUN_ID, [pending]);
    const events = await store.tail(RUN_ID, 0);
    const completed = events.find((ev) => ev.type === 'agent.completed');
    expect(completed?.agentId).toBe(DELEGATE_ID);
    expect(completed?.agentName).toBe('Spawn Tester 1');
  });
});

describe('SqliteRunEventStore truncation', () => {
  test('records a closed deletion range that stops at the removed tail', async () => {
    const { store, db } = storeWithDbOf();
    store.appendForThread(THREAD_ID, RUN_ID, [
      { type: 'user', text: 'one' },
      { type: 'user', text: 'two' },
      { type: 'user', text: 'three' },
    ] as PendingSessionEvent[]);
    const result = await store.truncateThreadFrom(THREAD_ID, 2);
    expect(result.lastThreadSeq).toBe(3);
    const row = db
      .prepare(
        'SELECT from_thread_seq, to_thread_seq FROM thread_log_deletions WHERE thread_id = ?',
      )
      .get(THREAD_ID);
    expect(row).toEqual({ from_thread_seq: 2, to_thread_seq: 3 });
  });
});
