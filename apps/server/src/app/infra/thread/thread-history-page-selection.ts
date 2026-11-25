import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { waitingForProfileIdFromEvents } from '../../application/threads/thread.helpers.ts';
import type { ThreadHistorySlice } from '../../domain/thread/thread-history-page.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable } from '../org-sqlite/schema/index.ts';
import { joinedRows, rowsToEvents } from '../runtime/run-events-append.ts';

const WAITING_SCAN_LIMIT = 50;
const WAITING_EVENT_TYPES = ['placement.decided', 'wait.started'];
const PAGE_BOUNDARY_MAX = 20;
const LOOSE_PAGE_MAX = 200;

export interface ThreadEventRow {
  event: typeof runEventsTable.$inferSelect;
  agentId: string | null;
  agentName: string | null;
}

export function maxThreadSeqOf(db: OrgSqliteDb, threadId: string): number {
  const row = db
    .select({ value: sql<number | null>`MAX(${runEventsTable.threadSeq})` })
    .from(runEventsTable)
    .where(eq(runEventsTable.threadId, threadId))
    .get();
  return row?.value ?? 0;
}

export function waitingForProfileIdOf(db: OrgSqliteDb, threadId: string): string | undefined {
  const rows = joinedRows(db)
    .where(
      and(eq(runEventsTable.threadId, threadId), inArray(runEventsTable.type, WAITING_EVENT_TYPES)),
    )
    .orderBy(desc(runEventsTable.threadSeq))
    .limit(WAITING_SCAN_LIMIT)
    .all();
  return waitingForProfileIdFromEvents(rowsToEvents(rows).reverse());
}

export function firstUserThreadSeqOf(db: OrgSqliteDb, threadId: string): number | null {
  const row = db.all<{ value: number | null }>(sql`
    SELECT MIN(thread_seq) AS value FROM run_events
    WHERE thread_id = ${threadId} AND type = 'user'
  `)[0];
  return row?.value ?? null;
}

export function minMaxThreadSeqOf(rows: readonly ThreadEventRow[]): {
  minThreadSeq: number;
  maxThreadSeq: number;
} {
  if (rows.length === 0) {
    return { minThreadSeq: 0, maxThreadSeq: 0 };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const row of rows) {
    min = Math.min(min, row.event.threadSeq);
    max = Math.max(max, row.event.threadSeq);
  }
  return { minThreadSeq: min, maxThreadSeq: max };
}

export function emptySlice(db: OrgSqliteDb, threadId: string): ThreadHistorySlice {
  return {
    events: [],
    minThreadSeq: 0,
    maxThreadSeq: 0,
    hasMoreBefore: false,
    hasMoreAfter: false,
    hiddenRunsBefore: 0,
    firstUserThreadSeq: firstUserThreadSeqOf(db, threadId),
    waitingForProfileId: waitingForProfileIdOf(db, threadId),
    complete: true,
  };
}

export function rootStartSeqOf(db: OrgSqliteDb, threadId: string, runId: string): number | null {
  const row = db.all<{ value: number | null }>(sql`
    SELECT MIN(thread_seq) AS value FROM run_events
    WHERE thread_id = ${threadId} AND run_id = ${runId}
  `)[0];
  return row?.value ?? null;
}

export function runIdAtOrAfterOf(
  db: OrgSqliteDb,
  threadId: string,
  threadSeq: number,
): string | undefined {
  const row = db.all<{ run_id: string | null }>(sql`
    SELECT run_id FROM run_events
    WHERE thread_id = ${threadId} AND thread_seq = ${threadSeq}
    LIMIT 1
  `)[0];
  if (row === undefined) {
    return undefined;
  }
  if (row.run_id !== null) {
    return row.run_id;
  }
  const next = db.all<{ run_id: string }>(sql`
    SELECT run_id FROM run_events
    WHERE thread_id = ${threadId} AND thread_seq > ${threadSeq} AND run_id IS NOT NULL
    ORDER BY thread_seq
    LIMIT 1
  `)[0];
  return next?.run_id;
}

export function rootRunIdOf(db: OrgSqliteDb, threadId: string, runId: string): string | undefined {
  const chain = db.all<{ run_id: string }>(sql`
    WITH RECURSIVE chain(run_id, parent_run_id, depth) AS (
      SELECT run_id, parent_run_id, 0 FROM runs
      WHERE run_id = ${runId} AND thread_id = ${threadId}
      UNION ALL
      SELECT r.run_id, r.parent_run_id, c.depth + 1
      FROM runs r JOIN chain c ON r.run_id = c.parent_run_id
    )
    SELECT run_id FROM chain ORDER BY depth DESC LIMIT 1
  `);
  return chain[0]?.run_id;
}

export function subtreeRunIdsOf(db: OrgSqliteDb, rootIds: readonly string[]): string[] {
  if (rootIds.length === 0) {
    return [];
  }
  const ids = sql.join(
    rootIds.map((runId) => sql`${runId}`),
    sql`, `,
  );
  const rows = db.all<{ run_id: string }>(sql`
    WITH RECURSIVE sub(run_id) AS (
      SELECT run_id FROM runs WHERE run_id IN (${ids})
      UNION ALL
      SELECT r.run_id FROM runs r JOIN sub ON r.parent_run_id = sub.run_id
    )
    SELECT run_id FROM sub
  `);
  return rows.map((row) => row.run_id);
}

export function boundaryLooseSeqsOf(
  db: OrgSqliteDb,
  threadId: string,
  pageStart: number,
): number[] {
  const rows = db
    .select({
      threadSeq: runEventsTable.threadSeq,
      runId: runEventsTable.runId,
    })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), lt(runEventsTable.threadSeq, pageStart)))
    .orderBy(desc(runEventsTable.threadSeq))
    .limit(PAGE_BOUNDARY_MAX)
    .all();
  const seqs: number[] = [];
  for (const row of rows) {
    if (row.runId !== null) {
      break;
    }
    seqs.push(row.threadSeq);
  }
  return seqs;
}

export function looseSeqsInRangeOf(
  db: OrgSqliteDb,
  threadId: string,
  fromThreadSeq: number,
  toThreadSeq: number,
): number[] {
  const rows = db
    .select({ threadSeq: runEventsTable.threadSeq })
    .from(runEventsTable)
    .where(
      and(
        eq(runEventsTable.threadId, threadId),
        sql`${runEventsTable.runId} IS NULL`,
        sql`${runEventsTable.threadSeq} >= ${fromThreadSeq}`,
        sql`${runEventsTable.threadSeq} <= ${toThreadSeq}`,
      ),
    )
    .orderBy(runEventsTable.threadSeq)
    .all();
  return rows.map((row) => row.threadSeq);
}

export function looseSeqsAfterOf(
  db: OrgSqliteDb,
  threadId: string,
  afterThreadSeq: number,
): number[] {
  const rows = db
    .select({ threadSeq: runEventsTable.threadSeq })
    .from(runEventsTable)
    .where(
      and(
        eq(runEventsTable.threadId, threadId),
        sql`${runEventsTable.runId} IS NULL`,
        sql`${runEventsTable.threadSeq} > ${afterThreadSeq}`,
      ),
    )
    .orderBy(runEventsTable.threadSeq)
    .all();
  return rows.map((row) => row.threadSeq);
}

export function loosePageOf(
  db: OrgSqliteDb,
  threadId: string,
  beforeThreadSeq?: number | null,
): { seqs: number[]; hasMore: boolean } {
  const rows = db
    .select({ threadSeq: runEventsTable.threadSeq })
    .from(runEventsTable)
    .where(
      and(
        eq(runEventsTable.threadId, threadId),
        sql`${runEventsTable.runId} IS NULL`,
        beforeThreadSeq != null ? sql`${runEventsTable.threadSeq} < ${beforeThreadSeq}` : undefined,
      ),
    )
    .orderBy(desc(runEventsTable.threadSeq))
    .limit(LOOSE_PAGE_MAX + 1)
    .all();
  const seqs = rows.slice(0, LOOSE_PAGE_MAX).map((row) => row.threadSeq);
  const truncated = rows.length > LOOSE_PAGE_MAX;
  const minSeq = seqs.length > 0 ? (seqs[seqs.length - 1] as number) : 0;
  const hasMore = truncated || (seqs.length > 0 && hasEventsBeforeOf(db, threadId, minSeq));
  return { seqs, hasMore };
}

export function hasEventsBeforeOf(db: OrgSqliteDb, threadId: string, threadSeq: number): boolean {
  const row = db
    .select({ threadSeq: runEventsTable.threadSeq })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), lt(runEventsTable.threadSeq, threadSeq)))
    .orderBy(desc(runEventsTable.threadSeq))
    .limit(1)
    .all();
  return row.length > 0;
}

export function pageRowsOf(
  db: OrgSqliteDb,
  threadId: string,
  runIds: readonly string[],
  userSeqs: readonly number[],
): ThreadEventRow[] {
  const scoped =
    userSeqs.length === 0
      ? inArray(runEventsTable.runId, [...runIds])
      : or(
          inArray(runEventsTable.runId, [...runIds]),
          inArray(runEventsTable.threadSeq, [...userSeqs]),
        );
  return joinedRows(db)
    .where(and(eq(runEventsTable.threadId, threadId), scoped))
    .orderBy(runEventsTable.threadSeq)
    .all();
}

export function hiddenRunsBeforeOf(
  db: OrgSqliteDb,
  threadId: string,
  minThreadSeq: number,
): number {
  const row = db.all<{ value: number }>(sql`
    WITH starts AS (
      SELECT run_id, MIN(thread_seq) AS start_seq FROM run_events
      WHERE thread_id = ${threadId}
      GROUP BY run_id
    )
    SELECT COUNT(*) AS value
    FROM runs r
    JOIN starts s ON s.run_id = r.run_id
    WHERE r.thread_id = ${threadId}
      AND (r.parent_run_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM runs p WHERE p.run_id = r.parent_run_id))
      AND s.start_seq < ${minThreadSeq}
  `)[0];
  return row?.value ?? 0;
}

export function hasRootStartAfterOf(
  db: OrgSqliteDb,
  threadId: string,
  maxThreadSeq: number,
): boolean {
  const row = db.all<{ hit: number }>(sql`
    WITH starts AS (
      SELECT run_id, MIN(thread_seq) AS start_seq FROM run_events
      WHERE thread_id = ${threadId}
      GROUP BY run_id
    )
    SELECT 1 AS hit
    FROM runs r
    JOIN starts s ON s.run_id = r.run_id
    WHERE r.thread_id = ${threadId}
      AND (r.parent_run_id IS NULL
           OR NOT EXISTS (SELECT 1 FROM runs p WHERE p.run_id = r.parent_run_id))
      AND s.start_seq > ${maxThreadSeq}
    LIMIT 1
  `)[0];
  return row !== undefined;
}
