import { Injectable } from '@harnesys/brix';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type {
  ThreadActiveRun,
  ThreadActiveRunStatus,
  ThreadInsert,
  ThreadPatch,
  ThreadRecord,
} from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { runAttributionOf } from '../org-sqlite/run-attribution.ts';
import { type RunRow, runsTable, threadAgentsTable, threadsTable } from '../org-sqlite/schema';
import { sourceRootsOf } from '../org-sqlite/source-roots.query.ts';
import { projectLegacyRunDirectory } from './legacy-workspace-ref.ts';
import { threadPatchUpdates } from './thread-patch-updates.ts';
import { toThread } from './thread-row-mapping.ts';

const ACTIVE_RUN_STATUSES: ThreadActiveRunStatus[] = [
  'queued',
  'running',
  'needs_input',
  'waiting',
];

function applyThreadPatch(
  db: OrgSqliteDb,
  orgId: string,
  id: string,
  patch: ThreadPatch,
): ThreadRecord {
  const sourceRoots = sourceRootsOf(db, orgId);
  const row = db
    .update(threadsTable)
    .set(threadPatchUpdates(patch, sourceRoots))
    .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
    .returning()
    .get();
  if (!row) {
    throw new ThreadNotFoundException(id);
  }
  return toThread(row, sourceRoots);
}

@Injectable()
export class ThreadRepositoryAdapter extends ThreadRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): ThreadRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const sourceRoots = sourceRootsOf(db, orgId);
      return db
        .select()
        .from(threadsTable)
        .where(eq(threadsTable.orgId, orgId))
        .orderBy(threadsTable.updatedAt)
        .all()
        .map((row) => toThread(row, sourceRoots));
    });
  }

  findById(orgId: string, id: string): ThreadRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
        .get();
      return row ? toThread(row, sourceRootsOf(db, orgId)) : undefined;
    });
  }

  insert(rec: ThreadInsert): ThreadRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const sourceRoots = sourceRootsOf(db, rec.orgId);
        const workspaceRef = rec.workspaceRef ?? null;
        const row = db
          .insert(threadsTable)
          .values({
            id: rec.id,
            orgId: rec.orgId,
            title: rec.title,
            kind: rec.kind,
            autoReplyAgentId: rec.autoReplyAgentId,
            policy: JSON.stringify(rec.policy),
            lastThreadSeq: rec.lastThreadSeq,
            conversationCount: rec.conversationCount,
            parentThreadId: rec.parentThreadId,
            forkAt: rec.forkAt,
            inheritedEventCount: String(rec.inheritedEventCount),
            metadata: JSON.stringify(rec.metadata ?? {}),
            issueId: rec.issueId ?? null,
            runProfileId: rec.runProfileId ?? null,
            runDirectory:
              workspaceRef === null
                ? (rec.runDirectory ?? null)
                : projectLegacyRunDirectory(workspaceRef, sourceRoots),
            workspaceRef: workspaceRef === null ? null : JSON.stringify(workspaceRef),
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
            lastReadAt: rec.lastReadAt,
          })
          .returning()
          .get();
        return toThread(row, sourceRoots);
      } catch (err) {
        throw mapThreadSqliteError(err);
      }
    });
  }

  patch(orgId: string, id: string, patch: ThreadPatch): ThreadRecord {
    return withOrgSqlite(this.layout, orgId, (db) => applyThreadPatch(db, orgId, id, patch));
  }

  markRead(orgId: string, id: string, at: string): ThreadRecord {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
        .get();
      if (!row) {
        throw new ThreadNotFoundException(id);
      }
      const next = db
        .update(threadsTable)
        .set({ lastReadAt: at > row.updatedAt ? at : row.updatedAt })
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
        .returning()
        .get();
      return toThread(next, sourceRootsOf(db, orgId));
    });
  }

  updateTitle(orgId: string, id: string, title: string): ThreadRecord {
    return this.patch(orgId, id, { title });
  }

  touch(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.update(threadsTable)
        .set({ updatedAt: new Date().toISOString() })
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
        .run();
    });
  }

  delete(orgId: string, id: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
        .run();
    });
  }

  override deleteMany(orgId: string, ids: string[]): void {
    if (ids.length === 0) {
      return;
    }
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), inArray(threadsTable.id, ids)))
        .run();
    });
  }

  deleteByAgent(orgId: string, agentId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      const threadIds = db
        .select({ threadId: threadAgentsTable.threadId })
        .from(threadAgentsTable)
        .innerJoin(threadsTable, eq(threadsTable.id, threadAgentsTable.threadId))
        .where(
          and(
            eq(threadsTable.orgId, orgId),
            eq(threadAgentsTable.agentId, agentId),
            ne(threadsTable.kind, 'group'),
          ),
        )
        .all()
        .map((row) => row.threadId);
      if (threadIds.length === 0) {
        return;
      }
      db.delete(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), inArray(threadsTable.id, threadIds)))
        .run();
    });
  }

  listByIssue(orgId: string, issueId: string): ThreadRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const sourceRoots = sourceRootsOf(db, orgId);
      return db
        .select()
        .from(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.issueId, issueId)))
        .all()
        .map((row) => toThread(row, sourceRoots));
    });
  }

  findByIssueAndAgent(orgId: string, issueId: string, agentId: string): ThreadRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ thread: threadsTable })
        .from(threadsTable)
        .innerJoin(threadAgentsTable, eq(threadAgentsTable.threadId, threadsTable.id))
        .where(
          and(
            eq(threadsTable.orgId, orgId),
            eq(threadsTable.issueId, issueId),
            eq(threadAgentsTable.agentId, agentId),
          ),
        )
        .get();
      return row ? toThread(row.thread, sourceRootsOf(db, orgId)) : undefined;
    });
  }

  threadIdsWithRuns(orgId: string): Set<string> {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .selectDistinct({ threadId: runsTable.threadId })
        .from(runsTable)
        .innerJoin(threadsTable, eq(runsTable.threadId, threadsTable.id))
        .where(eq(threadsTable.orgId, orgId))
        .all();
      return new Set(rows.map((row) => row.threadId));
    });
  }
  threadHasRuns(orgId: string, threadId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ runId: runsTable.runId })
        .from(runsTable)
        .innerJoin(threadsTable, eq(runsTable.threadId, threadsTable.id))
        .where(and(eq(threadsTable.orgId, orgId), eq(runsTable.threadId, threadId)))
        .limit(1)
        .get();
      return row !== undefined;
    });
  }

  listActiveRuns(orgId: string): ThreadActiveRun[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ run: runsTable })
        .from(runsTable)
        .innerJoin(threadsTable, eq(runsTable.threadId, threadsTable.id))
        .where(
          and(
            eq(threadsTable.orgId, orgId),
            isNull(runsTable.parentRunId),
            inArray(runsTable.status, [...ACTIVE_RUN_STATUSES]),
          ),
        )
        .orderBy(desc(runsTable.createdAt))
        .all()
        .map(({ run }) => toActiveRun(run))
        .filter(
          (run, index, all) => all.findIndex((item) => item.threadId === run.threadId) === index,
        ),
    );
  }

  findActiveRun(orgId: string, threadId: string): ThreadActiveRun | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select({ run: runsTable })
        .from(runsTable)
        .innerJoin(threadsTable, eq(runsTable.threadId, threadsTable.id))
        .where(
          and(
            eq(threadsTable.orgId, orgId),
            eq(runsTable.threadId, threadId),
            isNull(runsTable.parentRunId),
            inArray(runsTable.status, [...ACTIVE_RUN_STATUSES]),
          ),
        )
        .orderBy(desc(runsTable.createdAt))
        .limit(1)
        .get();
      return row ? toActiveRun(row.run) : undefined;
    });
  }
}

function toActiveRun(row: RunRow): ThreadActiveRun {
  const status = row.status as ThreadActiveRunStatus;
  const attribution = runAttributionOf(row);
  const lease =
    row.leaseExpiresAt === null || row.leaseExpiresAt === undefined
      ? {}
      : { leaseExpiresAt: row.leaseExpiresAt };
  return {
    runId: row.runId,
    threadId: row.threadId,
    status,
    ...lease,
    startedByUserId: attribution.startedByUserId,
    via: attribution.via,
    onNodeId: attribution.onNodeId ?? null,
  };
}

function mapThreadSqliteError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('FOREIGN KEY') || message.includes('SQLITE_CONSTRAINT')) {
    return new ThreadValidationException('thread reference not found');
  }
  return err instanceof Error ? err : new Error(message);
}
