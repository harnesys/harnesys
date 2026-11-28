import { Database } from 'bun:sqlite';
import { expect, test } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type {
  CompactionOutcome,
  RunEventFeed,
  RunLifecycleStatus,
  RunRecord,
  SessionEvent,
} from 'harnesys';
import {
  enqueueCompactionRequest,
  hasPendingCompactionRequest,
} from '../org-sqlite/compaction-request.store.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { threadsTable } from '../org-sqlite/schema/index.ts';
import { createCompactionChannel } from './org-runtime-compaction-channel.ts';

const COMPLETED: CompactionOutcome = {
  compacted: true,
  id: 'k1',
  coveredFrom: 0,
  coveredUntil: 4,
  tokensBefore: 100,
  tokensAfter: 20,
};

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

function runRecordOf(status: RunLifecycleStatus): RunRecord {
  return {
    runId: 'run-1',
    threadId: 'thread-1',
    status,
    attempt: 1,
    leaseEpoch: 1,
    lastSeq: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function pendingFeed(): Pick<RunEventFeed, 'subscribe'> {
  return {
    subscribe: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<SessionEvent>>(() => {}),
        return: () => Promise.resolve({ done: true, value: undefined }),
      }),
    }),
  };
}

function seedRequest(db: OrgSqliteDb): void {
  enqueueCompactionRequest(db, {
    requestId: 'req-1',
    threadId: 'thread-1',
    targetRunId: 'run-1',
  });
}

test('settle resolves a waiting awaitOutcome and persists the outcome', async () => {
  const db = setup();
  seedRequest(db);
  const channel = createCompactionChannel({
    db,
    lifecycle: { get: () => Promise.resolve(runRecordOf('running')) },
    feed: pendingFeed(),
  });
  const waiting = channel.awaitOutcome('req-1');
  await channel.settle('req-1', COMPLETED);
  expect(await waiting).toEqual(COMPLETED);
});

test('a run that ends unsettled yields an error outcome', async () => {
  const db = setup();
  seedRequest(db);
  const channel = createCompactionChannel({
    db,
    lifecycle: { get: () => Promise.resolve(runRecordOf('completed')) },
    feed: pendingFeed(),
  });
  expect(await channel.awaitOutcome('req-1')).toEqual({
    compacted: false,
    error: 'run ended before compaction settled',
  });
});

test('abort resolves cancelled and a pre-settled outcome is returned without waiting', async () => {
  const db = setup();
  seedRequest(db);
  const controller = new AbortController();
  const channel = createCompactionChannel({
    db,
    lifecycle: { get: () => Promise.resolve(runRecordOf('running')) },
    feed: pendingFeed(),
  });
  const waiting = channel.awaitOutcome('req-1', controller.signal);
  controller.abort();
  expect(await waiting).toEqual({ compacted: false, reason: 'cancelled' });

  await channel.settle('req-1', COMPLETED);
  expect(await channel.awaitOutcome('req-1')).toEqual(COMPLETED);
});

test('a missing run record is treated as terminal and clears the pending request', async () => {
  const db = setup();
  seedRequest(db);
  const channel = createCompactionChannel({
    db,
    lifecycle: { get: () => Promise.resolve(null) },
    feed: pendingFeed(),
  });
  expect(await channel.awaitOutcome('req-1')).toEqual({
    compacted: false,
    error: 'run ended before compaction settled',
  });
  expect(hasPendingCompactionRequest(db, 'thread-1')).toBe(false);
});
