import { SQLiteError } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import {
  codedRunError,
  type PendingSessionEvent,
  type RunCreateInput,
  type RunLifecycleStatus,
  type RunRecord,
  type RunTransitionPatch,
  type SessionEvent,
} from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runAttributionOf, runAttributionValues } from '../org-sqlite/run-attribution.ts';
import { type RunRow, runsTable } from '../org-sqlite/schema/index.ts';
import type { RunEventAppendWithinTx } from './run-append-context.ts';

interface RunIdRow {
  run_id: string;
}

export function rowToRecord(row: RunRow): RunRecord {
  return {
    runId: row.runId,
    threadId: row.threadId,
    ...(row.agentId !== null ? { agentId: row.agentId } : {}),
    agentName: row.agentName,
    status: row.status as RunLifecycleStatus,
    interruptId: row.interruptId ?? undefined,
    waitFireAt: row.waitFireAt ?? undefined,
    parentRunId: row.parentRunId ?? undefined,
    attempt: row.attempt,
    leaseInstanceId: row.leaseInstanceId ?? undefined,
    leaseExpiresAt: row.leaseExpiresAt ?? undefined,
    leaseEpoch: row.leaseEpoch,
    lastSeq: row.lastSeq,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    attribution: runAttributionOf(row),
  };
}

function clientEventIdOf(event: PendingSessionEvent): string | undefined {
  return (event as { clientEventId?: string }).clientEventId;
}

function interruptIdOf(event: PendingSessionEvent | SessionEvent): string | undefined {
  return (event as { interruptId?: string }).interruptId;
}

export function maxSeqOf(events: SessionEvent[], base: number): number {
  let max = base;
  for (const event of events) {
    const seq = (event as { seq?: number }).seq ?? 0;
    if (seq > max) {
      max = seq;
    }
  }
  return max;
}

export function assertTransitionAllowed(
  record: RunRecord,
  expectedEpoch: number,
  patch: RunTransitionPatch,
): void {
  if (record.status === 'completed') {
    throw codedRunError('run_terminal', `run ${record.runId} is terminal`);
  }
  if (patch.to === 'queued' && record.status === 'queued') {
    throw codedRunError('already_queued', `run ${record.runId} is already queued`);
  }
  if (expectedEpoch !== record.leaseEpoch) {
    throw codedRunError('lease_stale', `run ${record.runId} epoch ${expectedEpoch} is stale`);
  }
  if (record.status !== patch.from) {
    throw codedRunError('already_resumed', `run ${record.runId} is ${record.status}`);
  }
  if (patch.to === 'queued' && record.interruptId !== undefined) {
    const first = patch.events?.[0];
    if (record.interruptId !== (first ? interruptIdOf(first) : undefined)) {
      throw codedRunError('unknown_interrupt', `run ${record.runId} interrupt mismatch`);
    }
  }
}

function findIdempotentRun(
  tx: OrgSqliteDb,
  threadId: string,
  events: PendingSessionEvent[],
): RunRecord | null {
  for (const event of events) {
    const clientEventId = clientEventIdOf(event);
    if (clientEventId === undefined) {
      continue;
    }
    const found = tx.get<RunIdRow>(
      sql`SELECT run_id FROM run_events WHERE thread_id = ${threadId} AND client_event_id = ${clientEventId} LIMIT 1`,
    );
    if (!found) {
      continue;
    }
    const existing = tx.select().from(runsTable).where(eq(runsTable.runId, found.run_id)).get();
    if (existing) {
      return rowToRecord(existing);
    }
  }
  return null;
}

function insertQueuedRun(tx: OrgSqliteDb, run: RunCreateInput): void {
  const now = new Date().toISOString();
  try {
    tx.insert(runsTable)
      .values({
        runId: run.runId,
        threadId: run.threadId,
        agentId: run.agentId === '' ? null : run.agentId,
        agentName: run.agentName,
        status: 'queued',
        parentRunId: run.parentRunId,
        attempt: 1,
        leaseEpoch: 0,
        lastSeq: 0,
        ...runAttributionValues(run.attribution),
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (err) {
    if (err instanceof SQLiteError && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw codedRunError('thread_busy', 'thread already has an active run');
    }
    throw err;
  }
}

export function createRunInTx(
  tx: OrgSqliteDb,
  appendWithinTx: RunEventAppendWithinTx,
  run: RunCreateInput,
  events: PendingSessionEvent[],
): RunRecord {
  const existing = findIdempotentRun(tx, run.threadId, events);
  if (existing) {
    return existing;
  }
  insertQueuedRun(tx, run);
  if (events.length > 0) {
    const stored = appendWithinTx(tx, run.runId, run.threadId, events);
    tx.update(runsTable)
      .set({ lastSeq: maxSeqOf(stored, 0), updatedAt: new Date().toISOString() })
      .where(eq(runsTable.runId, run.runId))
      .run();
  }
  const row = tx.select().from(runsTable).where(eq(runsTable.runId, run.runId)).get();
  if (!row) {
    throw codedRunError('unknown_run', `run ${run.runId} not found`);
  }
  return rowToRecord(row);
}
