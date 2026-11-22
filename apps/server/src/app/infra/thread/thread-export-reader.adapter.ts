import { Injectable } from '@harnesys/brix';
import { eq } from 'drizzle-orm';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  type ThreadExportEvent,
  type ThreadExportPlan,
  ThreadExportReaderPort,
  type ThreadExportRun,
  type ThreadExportSnapshot,
} from '../../domain/thread/thread-export-reader.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import {
  runEventsTable,
  runSnapshotsTable,
  runsTable,
  threadPlansTable,
} from '../org-sqlite/schema/index.ts';

@Injectable()
export class ThreadExportReaderAdapter extends ThreadExportReaderPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  readEvents(orgId: string, threadId: string): Promise<ThreadExportEvent[]> {
    const rows = withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select()
        .from(runEventsTable)
        .where(eq(runEventsTable.threadId, threadId))
        .orderBy(runEventsTable.threadSeq)
        .all(),
    );
    return Promise.resolve(
      rows.map((row) => ({
        threadSeq: row.threadSeq,
        runId: row.runId,
        seq: row.seq,
        type: row.type,
        timestamp: row.timestamp,
        metadata: row.metadata,
        conversational: row.conversational === 1,
        clientEventId: row.clientEventId,
      })),
    );
  }

  readRuns(orgId: string, threadId: string): Promise<ThreadExportRun[]> {
    const rows = withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(runsTable).where(eq(runsTable.threadId, threadId)).all(),
    );
    return Promise.resolve(
      rows.map((row) => ({
        runId: row.runId,
        threadId: row.threadId,
        agentId: row.agentId,
        agentName: row.agentName,
        status: row.status,
        interruptId: row.interruptId,
        waitFireAt: row.waitFireAt,
        parentRunId: row.parentRunId,
        attempt: row.attempt,
        leaseInstanceId: row.leaseInstanceId,
        leaseExpiresAt: row.leaseExpiresAt,
        leaseEpoch: row.leaseEpoch,
        lastSeq: row.lastSeq,
        startedByUserId: row.startedByUserId,
        via: row.via,
        onNodeId: row.onNodeId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    );
  }

  readSnapshots(orgId: string, threadId: string): Promise<ThreadExportSnapshot[]> {
    const rows = withOrgSqlite(this.layout, orgId, (db) =>
      db
        .select({ snapshot: runSnapshotsTable })
        .from(runSnapshotsTable)
        .innerJoin(runsTable, eq(runsTable.runId, runSnapshotsTable.runId))
        .where(eq(runsTable.threadId, threadId))
        .all(),
    );
    return Promise.resolve(
      rows.map(({ snapshot }) => ({
        runId: snapshot.runId,
        sessionId: snapshot.sessionId,
        status: snapshot.status,
        runtimeVersion: snapshot.runtimeVersion,
        updatedAt: snapshot.updatedAt,
        snapshot: snapshot.snapshot,
      })),
    );
  }

  readPlan(orgId: string, threadId: string): Promise<ThreadExportPlan | null> {
    const row = withOrgSqlite(this.layout, orgId, (db) =>
      db.select().from(threadPlansTable).where(eq(threadPlansTable.threadId, threadId)).get(),
    );
    return Promise.resolve(
      row
        ? { snapshot: row.snapshotJson, createdAt: row.createdAt, updatedAt: row.updatedAt }
        : null,
    );
  }
}
