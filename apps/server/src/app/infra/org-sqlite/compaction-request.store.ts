import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { CompactionOutcome, CompactionRequest } from 'harnesys';
import { RUN_NON_TERMINAL } from 'harnesys';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import { compactionRequestsTable, runsTable } from './schema/index.ts';

export type CompactionRequestStatus = 'pending' | 'consumed' | 'settled' | 'withdrawn';

export interface CompactionRequestRecord {
  requestId: string;
  threadId: string;
  targetRunId: string;
  status: CompactionRequestStatus;
  queuedAt: string;
  settledAt: string | null;
}

export function enqueueCompactionRequest(db: OrgSqliteDb, request: CompactionRequest): void {
  db.insert(compactionRequestsTable)
    .values({
      requestId: request.requestId,
      threadId: request.threadId,
      targetRunId: request.targetRunId,
      status: 'pending',
      queuedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .run();
}

export function takePendingCompactionRequest(
  db: OrgSqliteDb,
  threadId: string,
  runId: string,
): CompactionRequest | null {
  const head = sql`(SELECT ${compactionRequestsTable.requestId} FROM ${compactionRequestsTable}
    WHERE ${compactionRequestsTable.threadId} = ${threadId}
      AND ${compactionRequestsTable.targetRunId} = ${runId}
      AND ${compactionRequestsTable.status} = 'pending'
    ORDER BY ${compactionRequestsTable.queuedAt} LIMIT 1)`;
  const row = db
    .update(compactionRequestsTable)
    .set({ status: 'consumed' })
    .where(eq(compactionRequestsTable.requestId, head))
    .returning({
      requestId: compactionRequestsTable.requestId,
      threadId: compactionRequestsTable.threadId,
      targetRunId: compactionRequestsTable.targetRunId,
    })
    .get();
  return row ?? null;
}

export function settleCompactionRequest(
  db: OrgSqliteDb,
  requestId: string,
  outcome: CompactionOutcome,
): void {
  db.update(compactionRequestsTable)
    .set({
      status: 'settled',
      outcomeJson: JSON.stringify(outcome),
      settledAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(compactionRequestsTable.requestId, requestId),
        inArray(compactionRequestsTable.status, ['pending', 'consumed']),
      ),
    )
    .run();
}

export function readCompactionOutcome(
  db: OrgSqliteDb,
  requestId: string,
): CompactionOutcome | null {
  const row = db
    .select({ outcomeJson: compactionRequestsTable.outcomeJson })
    .from(compactionRequestsTable)
    .where(
      and(
        eq(compactionRequestsTable.requestId, requestId),
        eq(compactionRequestsTable.status, 'settled'),
      ),
    )
    .get();
  if (!row?.outcomeJson) {
    return null;
  }
  try {
    return JSON.parse(row.outcomeJson) as CompactionOutcome;
  } catch {
    return null;
  }
}

export function readCompactionRequest(
  db: OrgSqliteDb,
  requestId: string,
): CompactionRequestRecord | null {
  const row = db
    .select()
    .from(compactionRequestsTable)
    .where(eq(compactionRequestsTable.requestId, requestId))
    .get();
  if (!row) {
    return null;
  }
  return {
    requestId: row.requestId,
    threadId: row.threadId,
    targetRunId: row.targetRunId,
    status: row.status as CompactionRequestStatus,
    queuedAt: row.queuedAt,
    settledAt: row.settledAt,
  };
}

export function withdrawCompactionRequest(db: OrgSqliteDb, requestId: string): void {
  db.update(compactionRequestsTable)
    .set({ status: 'withdrawn', settledAt: new Date().toISOString() })
    .where(
      and(
        eq(compactionRequestsTable.requestId, requestId),
        eq(compactionRequestsTable.status, 'pending'),
      ),
    )
    .run();
}

export function hasPendingCompactionRequest(db: OrgSqliteDb, threadId: string): boolean {
  const terminalRuns = db
    .select({ runId: runsTable.runId })
    .from(runsTable)
    .where(notInArray(runsTable.status, [...RUN_NON_TERMINAL]));
  const row = db
    .select({ requestId: compactionRequestsTable.requestId })
    .from(compactionRequestsTable)
    .where(
      and(
        eq(compactionRequestsTable.threadId, threadId),
        eq(compactionRequestsTable.status, 'pending'),
        notInArray(compactionRequestsTable.targetRunId, terminalRuns),
      ),
    )
    .limit(1)
    .get();
  return row !== undefined;
}
