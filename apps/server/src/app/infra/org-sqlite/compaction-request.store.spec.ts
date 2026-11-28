import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { CompactionOutcome } from 'harnesys';
import {
  enqueueCompactionRequest,
  hasPendingCompactionRequest,
  readCompactionOutcome,
  settleCompactionRequest,
  takePendingCompactionRequest,
  withdrawCompactionRequest,
} from './compaction-request.store.ts';
import { ensureOrgSchema } from './org-sql-ensure.ts';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import * as schema from './schema/index.ts';
import { runsTable, threadsTable } from './schema/index.ts';

function setup(): OrgSqliteDb {
  const sqlite = new Database(':memory:');
  ensureOrgSchema((sql) => sqlite.exec(sql));
  const db = drizzle(sqlite, { schema });
  db.insert(threadsTable)
    .values({
      id: 'thread-1',
      orgId: 'org-1',
      title: 't',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastReadAt: new Date().toISOString(),
    })
    .run();
  return db;
}

const COMPLETED: CompactionOutcome = {
  compacted: true,
  id: 'k1',
  coveredFrom: 0,
  coveredUntil: 4,
  tokensBefore: 100,
  tokensAfter: 20,
};

test('take is run-scoped and one-shot', () => {
  const db = setup();
  enqueueCompactionRequest(db, { requestId: 'req-1', threadId: 'thread-1', targetRunId: 'run-1' });
  expect(hasPendingCompactionRequest(db, 'thread-1')).toBe(true);
  expect(takePendingCompactionRequest(db, 'thread-1', 'run-other')).toBeNull();
  expect(takePendingCompactionRequest(db, 'thread-1', 'run-1')).toEqual({
    requestId: 'req-1',
    threadId: 'thread-1',
    targetRunId: 'run-1',
  });
  expect(takePendingCompactionRequest(db, 'thread-1', 'run-1')).toBeNull();
  expect(hasPendingCompactionRequest(db, 'thread-1')).toBe(false);
});

test('settle persists the outcome once and readOutcome returns it', () => {
  const db = setup();
  enqueueCompactionRequest(db, { requestId: 'req-1', threadId: 'thread-1', targetRunId: 'run-1' });
  takePendingCompactionRequest(db, 'thread-1', 'run-1');
  settleCompactionRequest(db, 'req-1', COMPLETED);
  settleCompactionRequest(db, 'req-1', { compacted: false, reason: 'empty-history' });
  expect(readCompactionOutcome(db, 'req-1')).toEqual(COMPLETED);
});

test('withdraw removes a pending request and blocks late settle', () => {
  const db = setup();
  enqueueCompactionRequest(db, { requestId: 'req-1', threadId: 'thread-1', targetRunId: 'run-1' });
  withdrawCompactionRequest(db, 'req-1');
  expect(takePendingCompactionRequest(db, 'thread-1', 'run-1')).toBeNull();
  expect(hasPendingCompactionRequest(db, 'thread-1')).toBe(false);
  settleCompactionRequest(db, 'req-1', COMPLETED);
  expect(readCompactionOutcome(db, 'req-1')).toBeNull();
});

test('enqueue is idempotent per requestId and withdraw never touches a consumed request', () => {
  const db = setup();
  const request = { requestId: 'req-1', threadId: 'thread-1', targetRunId: 'run-1' };
  enqueueCompactionRequest(db, request);
  enqueueCompactionRequest(db, request);
  takePendingCompactionRequest(db, 'thread-1', 'run-1');
  withdrawCompactionRequest(db, 'req-1');
  settleCompactionRequest(db, 'req-1', COMPLETED);
  expect(readCompactionOutcome(db, 'req-1')).toEqual(COMPLETED);
});

test('a pending request whose target run is terminal does not block the thread', () => {
  const db = setup();
  const now = new Date().toISOString();
  db.insert(runsTable)
    .values({
      runId: 'run-1',
      threadId: 'thread-1',
      agentName: 'a',
      status: 'completed',
      attempt: 1,
      leaseEpoch: 1,
      lastSeq: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  enqueueCompactionRequest(db, { requestId: 'req-1', threadId: 'thread-1', targetRunId: 'run-1' });
  expect(hasPendingCompactionRequest(db, 'thread-1')).toBe(false);
});
