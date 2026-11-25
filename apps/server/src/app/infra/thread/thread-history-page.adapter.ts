import { Injectable } from '@harnesys/brix';
import { THREAD_HISTORY_PAGE_RUNS, THREAD_HISTORY_RANGE_MAX_EVENTS } from '@harnesys/contracts';
import { and, eq, gt, gte, inArray, lt, or, sql } from 'drizzle-orm';
import type { SessionEvent } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import {
  ThreadHistoryPagePort,
  type ThreadHistoryPageRequest,
  type ThreadHistorySlice,
  type ThreadLogDeletion,
  type ThreadSyncSlice,
} from '../../domain/thread/thread-history-page.port.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable, threadLogDeletionsTable } from '../org-sqlite/schema/index.ts';
import { joinedRows, rowsToEvents } from '../runtime/run-events-append.ts';
import {
  boundaryUserSeqsOf,
  emptySlice,
  firstUserThreadSeqOf,
  hasRootStartAfterOf,
  hiddenRunsBeforeOf,
  maxThreadSeqOf,
  minMaxThreadSeqOf,
  pageRowsOf,
  rootRunIdOf,
  rootStartSeqOf,
  runIdAtOrAfterOf,
  subtreeRunIdsOf,
  waitingForProfileIdOf,
} from './thread-history-page-selection.ts';

@Injectable()
export class ThreadHistoryPageAdapter extends ThreadHistoryPagePort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  syncSlice(
    orgId: string,
    threadId: string,
    afterThreadSeq: number,
    limit: number,
  ): Promise<ThreadSyncSlice> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => {
        const serverMax = maxThreadSeqOf(db, threadId);
        const rows = joinedRows(db)
          .where(
            and(
              eq(runEventsTable.threadId, threadId),
              gt(runEventsTable.threadSeq, afterThreadSeq),
            ),
          )
          .orderBy(runEventsTable.threadSeq)
          .limit(limit)
          .all();
        const deletions: ThreadLogDeletion[] = db
          .select({
            from: threadLogDeletionsTable.fromThreadSeq,
            to: threadLogDeletionsTable.toThreadSeq,
          })
          .from(threadLogDeletionsTable)
          .where(eq(threadLogDeletionsTable.threadId, threadId))
          .orderBy(threadLogDeletionsTable.fromThreadSeq)
          .all();
        return { rows: rowsToEvents(rows), serverMax, deletions };
      }),
    );
  }

  waitingForProfileId(orgId: string, threadId: string): Promise<string | undefined> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => waitingForProfileIdOf(db, threadId)),
    );
  }

  listPage(
    orgId: string,
    threadId: string,
    request: ThreadHistoryPageRequest,
  ): Promise<ThreadHistorySlice> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => {
        const limit = request.limitRuns ?? THREAD_HISTORY_PAGE_RUNS;
        const before = request.beforeThreadSeq ?? null;
        const roots = db.all<{ run_id: string; start_seq: number }>(sql`
          WITH starts AS (
            SELECT run_id, MIN(thread_seq) AS start_seq FROM run_events
            WHERE thread_id = ${threadId}
              AND (${before} IS NULL OR thread_seq < ${before})
            GROUP BY run_id
          )
          SELECT s.run_id AS run_id, s.start_seq AS start_seq
          FROM starts s
          JOIN runs r ON r.run_id = s.run_id
          WHERE r.thread_id = ${threadId}
            AND (r.parent_run_id IS NULL
                 OR NOT EXISTS (SELECT 1 FROM runs p WHERE p.run_id = r.parent_run_id))
          ORDER BY s.start_seq DESC
          LIMIT ${limit + 1}
        `);
        if (roots.length === 0) {
          return emptySlice(db, threadId);
        }
        const pageRoots = roots.slice(0, limit);
        const pageStart = pageRoots.reduce((min, root) => Math.min(min, root.start_seq), Infinity);
        const runIds = subtreeRunIdsOf(
          db,
          pageRoots.map((root) => root.run_id),
        );
        const rows = pageRowsOf(db, threadId, runIds, boundaryUserSeqsOf(db, threadId, pageStart));
        const { minThreadSeq, maxThreadSeq } = minMaxThreadSeqOf(rows);
        return {
          events: rowsToEvents(rows),
          minThreadSeq,
          maxThreadSeq,
          hasMoreBefore: roots.length > limit,
          hasMoreAfter: false,
          hiddenRunsBefore: hiddenRunsBeforeOf(db, threadId, minThreadSeq),
          firstUserThreadSeq: firstUserThreadSeqOf(db, threadId),
          waitingForProfileId: waitingForProfileIdOf(db, threadId),
          complete: true,
        };
      }),
    );
  }

  listRange(
    orgId: string,
    threadId: string,
    fromThreadSeq: number,
    toThreadSeq: number,
  ): Promise<ThreadHistorySlice> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => {
        const rows = joinedRows(db)
          .where(
            and(
              eq(runEventsTable.threadId, threadId),
              gte(runEventsTable.threadSeq, fromThreadSeq),
              lt(runEventsTable.threadSeq, toThreadSeq),
            ),
          )
          .orderBy(runEventsTable.threadSeq)
          .limit(THREAD_HISTORY_RANGE_MAX_EVENTS + 1)
          .all();
        const straddling = db.all<{ hit: number }>(sql`
          SELECT 1 AS hit FROM run_events e
          WHERE e.thread_id = ${threadId}
          GROUP BY e.run_id
          HAVING (MIN(e.thread_seq) < ${fromThreadSeq} AND MAX(e.thread_seq) >= ${fromThreadSeq})
              OR (MIN(e.thread_seq) < ${toThreadSeq} AND MAX(e.thread_seq) >= ${toThreadSeq})
          LIMIT 1
        `);
        const { minThreadSeq, maxThreadSeq } = minMaxThreadSeqOf(rows);
        return {
          events: rowsToEvents(rows),
          minThreadSeq,
          maxThreadSeq,
          hasMoreBefore: false,
          hasMoreAfter: rows.length > THREAD_HISTORY_RANGE_MAX_EVENTS,
          hiddenRunsBefore: null,
          firstUserThreadSeq: firstUserThreadSeqOf(db, threadId),
          waitingForProfileId: waitingForProfileIdOf(db, threadId),
          complete: straddling.length === 0,
        };
      }),
    );
  }

  listAround(
    orgId: string,
    threadId: string,
    aroundThreadSeq: number,
  ): Promise<ThreadHistorySlice> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => {
        const runId = runIdAtOrAfterOf(db, threadId, aroundThreadSeq);
        if (runId === undefined) {
          return emptySlice(db, threadId);
        }
        const rootRunId = rootRunIdOf(db, threadId, runId);
        if (rootRunId === undefined) {
          return emptySlice(db, threadId);
        }
        const rootStart = rootStartSeqOf(db, threadId, rootRunId);
        if (rootStart === null) {
          return emptySlice(db, threadId);
        }
        const runIds = subtreeRunIdsOf(db, [rootRunId]);
        const rows = pageRowsOf(db, threadId, runIds, boundaryUserSeqsOf(db, threadId, rootStart));
        const { minThreadSeq, maxThreadSeq } = minMaxThreadSeqOf(rows);
        const hiddenRunsBefore = hiddenRunsBeforeOf(db, threadId, minThreadSeq);
        return {
          events: rowsToEvents(rows),
          minThreadSeq,
          maxThreadSeq,
          hasMoreBefore: hiddenRunsBefore > 0,
          hasMoreAfter: hasRootStartAfterOf(db, threadId, maxThreadSeq),
          hiddenRunsBefore,
          firstUserThreadSeq: firstUserThreadSeqOf(db, threadId),
          waitingForProfileId: waitingForProfileIdOf(db, threadId),
          complete: true,
        };
      }),
    );
  }

  listRunSubtree(orgId: string, threadId: string, runId: string): Promise<SessionEvent[]> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => {
        const subtree = subtreeRunIdsOf(db, [runId]);
        if (subtree.length === 0) {
          return [];
        }
        const parent = db.all<{ parent_run_id: string | null }>(sql`
          SELECT parent_run_id FROM runs WHERE run_id = ${runId}
        `)[0];
        const parentRunId = parent?.parent_run_id ?? null;
        const selfSpawnTypes = inArray(runEventsTable.type, [
          'agent.spawned',
          'agent.completed',
          'agent.failed',
        ]);
        const selfSpawnFilter =
          parentRunId === null
            ? undefined
            : and(
                selfSpawnTypes,
                sql`json_extract(${runEventsTable.metadata}, '$.spawnId') = ${runId}`,
              );
        const scope =
          parentRunId === null
            ? inArray(runEventsTable.runId, subtree)
            : or(
                inArray(runEventsTable.runId, subtree),
                and(eq(runEventsTable.runId, parentRunId), selfSpawnFilter),
              );
        const rows = joinedRows(db)
          .where(and(eq(runEventsTable.threadId, threadId), scope))
          .orderBy(runEventsTable.threadSeq)
          .all();
        return rowsToEvents(rows);
      }),
    );
  }

  listToolEvents(orgId: string, threadId: string): Promise<SessionEvent[]> {
    return Promise.resolve(
      withOrgSqlite(this.layout, orgId, (db) => {
        const rows = joinedRows(db)
          .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.type, 'tool')))
          .orderBy(runEventsTable.threadSeq)
          .all();
        return rowsToEvents(rows);
      }),
    );
  }
}
