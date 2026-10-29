import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { RunRecord } from 'harnesys';
import { InMemoryRunEventStore, InMemoryRunLifecycleStore } from 'harnesys';
import { CREATE_RUN_SNAPSHOTS_SQL, CREATE_RUNS_SQL } from '../org-sqlite/org-sql.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { runSnapshotsTable, runsTable } from '../org-sqlite/schema/index.ts';
import { recoverOrphanedRuns } from './recover-orphaned-runs.ts';

function record(patch: Partial<RunRecord> & { runId: string; threadId: string }): RunRecord {
  const now = new Date().toISOString();
  return {
    status: 'running',
    attempt: 1,
    leaseEpoch: 1,
    lastSeq: 0,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function setup() {
  const sqlite = new Database(':memory:');
  sqlite.exec(CREATE_RUNS_SQL);
  sqlite.exec(CREATE_RUN_SNAPSHOTS_SQL);
  const db = drizzle(sqlite, { schema }) as OrgSqliteDb;
  const lifecycle = new InMemoryRunLifecycleStore(new InMemoryRunEventStore());
  const seed = (rec: RunRecord): void => {
    lifecycle.runs.set(rec.runId, { ...rec });
    db.insert(runsTable)
      .values({
        runId: rec.runId,
        threadId: rec.threadId,
        status: rec.status,
        parentRunId: rec.parentRunId,
        attempt: rec.attempt,
        leaseEpoch: rec.leaseEpoch,
        lastSeq: rec.lastSeq,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
      })
      .run();
  };
  return { db, lifecycle, seed, close: () => sqlite.close() };
}

function snapshotRow(runId: string): {
  runId: string;
  sessionId: string;
  snapshot: string;
  status: string;
  runtimeVersion: string;
  updatedAt: number;
} {
  return {
    runId,
    sessionId: 'session-1',
    snapshot: '{}',
    status: 'running',
    runtimeVersion: '0.3.0',
    updatedAt: Date.now(),
  };
}

describe('recoverOrphanedRuns', () => {
  test('resumes orphaned run tree', async () => {
    const { db, lifecycle, seed, close } = setup();
    try {
      const root = record({ runId: 'run-root', threadId: 'thread-1', attempt: 2 });
      const runningChild = record({
        runId: 'run-child-1',
        threadId: 'thread-1',
        parentRunId: 'run-root',
      });
      const completedChild = record({
        runId: 'run-child-2',
        threadId: 'thread-1',
        parentRunId: 'run-root',
        status: 'completed',
      });
      seed(root);
      seed(runningChild);
      seed(completedChild);
      db.insert(runSnapshotsTable).values(snapshotRow('run-child-2')).run();

      const resumed = await recoverOrphanedRuns({ db, lifecycle });

      expect(resumed).toBe(1);
      const rootAfter = lifecycle.runs.get('run-root');
      const childAfter = lifecycle.runs.get('run-child-1');
      const doneChild = lifecycle.runs.get('run-child-2');
      expect(rootAfter?.status).toBe('queued');
      expect(rootAfter?.attempt).toBe(3);
      expect(childAfter?.status).toBe('failed');
      expect(doneChild?.status).toBe('completed');
      const snapshots = db
        .select({ runId: runSnapshotsTable.runId })
        .from(runSnapshotsTable)
        .where(eq(runSnapshotsTable.runId, 'run-child-2'))
        .all();
      expect(snapshots).toHaveLength(0);
    } finally {
      close();
    }
  });

  test('fails orphan superseded by newer run', async () => {
    const { db, lifecycle, seed, close } = setup();
    try {
      const root = record({
        runId: 'run-root',
        threadId: 'thread-1',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      seed(root);
      lifecycle.runs.set(
        'run-new',
        record({
          runId: 'run-new',
          threadId: 'thread-1',
          status: 'queued',
          createdAt: '2026-01-02T00:00:00.000Z',
        }),
      );

      const resumed = await recoverOrphanedRuns({ db, lifecycle });

      expect(resumed).toBe(0);
      expect(lifecycle.runs.get('run-root')?.status).toBe('failed');
    } finally {
      close();
    }
  });
});
