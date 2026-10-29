import { Injectable } from '@harnesys/brix';
import type { ThreadKind } from '@harnesys/contracts';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
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
import { type RunRow, runsTable, type ThreadRow, threadsTable } from '../org-sqlite/schema';

const ACTIVE_RUN_STATUSES: ThreadActiveRunStatus[] = [
  'queued',
  'running',
  'needs_input',
  'waiting',
];

interface ThreadPatchUpdates {
  agentId?: string;
  title?: string;
  kind?: ThreadKind;
  metadata?: string;
  issueId?: string | null;
  runProfileId?: string | null;
  runDirectory?: string | null;
  lastReadAt?: string;
  updatedAt: string;
}

function threadPatchUpdates(patch: ThreadPatch): ThreadPatchUpdates {
  const updates: ThreadPatchUpdates = { updatedAt: new Date().toISOString() };
  if (patch.agentId !== undefined) {
    updates.agentId = patch.agentId;
  }
  if (patch.title !== undefined) {
    updates.title = patch.title;
  }
  if (patch.kind !== undefined) {
    updates.kind = patch.kind;
  }
  if (patch.metadata !== undefined) {
    updates.metadata = JSON.stringify(patch.metadata);
  }
  if (patch.issueId !== undefined) {
    updates.issueId = patch.issueId;
  }
  if (patch.runProfileId !== undefined) {
    updates.runProfileId = patch.runProfileId;
  }
  if (patch.runDirectory !== undefined) {
    updates.runDirectory = patch.runDirectory;
  }
  if (patch.lastReadAt !== undefined) {
    updates.lastReadAt = patch.lastReadAt;
  }
  return updates;
}

function applyThreadPatch(
  db: OrgSqliteDb,
  orgId: string,
  id: string,
  patch: ThreadPatch,
): ThreadRecord {
  const row = db
    .update(threadsTable)
    .set(threadPatchUpdates(patch))
    .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
    .returning()
    .get();
  if (!row) {
    throw new ThreadNotFoundException(id);
  }
  return toThread(row);
}

@Injectable()
export class ThreadRepositoryAdapter extends ThreadRepositoryPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  listByOrg(orgId: string): ThreadRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(threadsTable)
        .where(eq(threadsTable.orgId, orgId))
        .orderBy(threadsTable.updatedAt)
        .all()
        .map(toThread),
    );
  }

  findById(orgId: string, id: string): ThreadRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.id, id)))
        .get();
      return row ? toThread(row) : undefined;
    });
  }

  insert(rec: ThreadInsert): ThreadRecord {
    return withOrgSqlite(this.layout, rec.orgId, (db) => {
      try {
        const row = db
          .insert(threadsTable)
          .values({
            id: rec.id,
            orgId: rec.orgId,
            agentId: rec.agentId,
            originAgentId: rec.originAgentId,
            title: rec.title,
            kind: rec.kind,
            parentThreadId: rec.parentThreadId,
            forkAt: rec.forkAt,
            inheritedEventCount: String(rec.inheritedEventCount),
            metadata: JSON.stringify(rec.metadata ?? {}),
            issueId: rec.issueId ?? null,
            runProfileId: rec.runProfileId ?? null,
            runDirectory: rec.runDirectory ?? null,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt,
            lastReadAt: rec.lastReadAt,
          })
          .returning()
          .get();
        return toThread(row);
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
      return toThread(next);
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

  deleteByAgent(orgId: string, agentId: string): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.delete(threadsTable)
        .where(
          and(
            eq(threadsTable.orgId, orgId),
            or(eq(threadsTable.agentId, agentId), eq(threadsTable.originAgentId, agentId)),
          ),
        )
        .run();
    });
  }

  listByIssue(orgId: string, issueId: string): ThreadRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(threadsTable)
        .where(and(eq(threadsTable.orgId, orgId), eq(threadsTable.issueId, issueId)))
        .all()
        .map(toThread),
    );
  }

  findByIssueAndAgent(orgId: string, issueId: string, agentId: string): ThreadRecord | undefined {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const row = db
        .select()
        .from(threadsTable)
        .where(
          and(
            eq(threadsTable.orgId, orgId),
            eq(threadsTable.issueId, issueId),
            eq(threadsTable.agentId, agentId),
          ),
        )
        .get();
      return row ? toThread(row) : undefined;
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

function toThread(row: ThreadRow): ThreadRecord {
  return {
    id: row.id,
    orgId: row.orgId,
    agentId: row.agentId,
    originAgentId: row.originAgentId,
    title: row.title,
    kind: row.kind,
    parentThreadId: row.parentThreadId ?? null,
    forkAt: row.forkAt ?? null,
    inheritedEventCount: Number(row.inheritedEventCount ?? '0'),
    metadata: parseMetadata(row.metadata),
    issueId: row.issueId ?? null,
    runProfileId: row.runProfileId ?? null,
    runDirectory: row.runDirectory ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastReadAt: row.lastReadAt || row.updatedAt,
  };
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

function mapThreadSqliteError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('FOREIGN KEY') || message.includes('SQLITE_CONSTRAINT')) {
    return new ThreadValidationException('agent not found for thread');
  }
  return err instanceof Error ? err : new Error(message);
}
