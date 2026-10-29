import { and, eq } from 'drizzle-orm';
import { codedRunError, type SessionEvent, type TruncateThreadResult } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  type RunEventRow,
  runEventsTable,
  runsTable,
  threadsTable,
} from '../org-sqlite/schema/index.ts';

export interface RemoveThreadEventResult {
  removed: SessionEvent | null;
  runDeleted: boolean;
}

export function rowToEvent(row: RunEventRow): SessionEvent {
  const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  return { ...(meta as object), type: row.type, seq: row.seq, runId: row.runId } as SessionEvent;
}

export function truncateThreadEvents(
  tx: OrgSqliteDb,
  threadId: string,
  runId: string,
  seq: number,
): TruncateThreadResult {
  const target = tx
    .select()
    .from(runEventsTable)
    .where(
      and(
        eq(runEventsTable.threadId, threadId),
        eq(runEventsTable.runId, runId),
        eq(runEventsTable.seq, seq),
      ),
    )
    .get();
  if (!target) {
    throw codedRunError('unknown_event', `event ${runId}:${seq} not found`);
  }
  const cutoff = rowToEvent(target);
  const rows = tx.select().from(runEventsTable).where(eq(runEventsTable.threadId, threadId)).all();
  const runRows = tx.select().from(runsTable).where(eq(runsTable.threadId, threadId)).all();
  const createdAtByRun = new Map(runRows.map((row) => [row.runId, row.createdAt]));
  const ordered = rows.sort(
    (a, b) =>
      a.timestamp - b.timestamp ||
      createdAtOf(createdAtByRun, a.runId).localeCompare(createdAtOf(createdAtByRun, b.runId)) ||
      a.seq - b.seq,
  );
  const cutoffIndex = ordered.findIndex((row) => row.runId === runId && row.seq === seq);
  if (cutoffIndex < 0) {
    throw codedRunError('unknown_event', `event ${runId}:${seq} not found`);
  }
  const tail = ordered.slice(cutoffIndex);
  for (const row of tail) {
    tx.delete(runEventsTable)
      .where(and(eq(runEventsTable.runId, row.runId), eq(runEventsTable.seq, row.seq)))
      .run();
  }
  const tailRunIds = new Set(tail.map((row) => row.runId));
  const removedRunIds = deleteEmptiedRuns(tx, tailRunIds);
  clearThreadLastErrorForRuns(tx, threadId, tailRunIds);
  const remainingUserCount = tx
    .select({ seq: runEventsTable.seq })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.type, 'user')))
    .all().length;
  return { cutoff, removedEvents: tail.length, removedRunIds, remainingUserCount };
}

export function removeThreadEventRow(
  tx: OrgSqliteDb,
  threadId: string,
  runId: string,
  seq: number,
): RemoveThreadEventResult {
  const target = tx
    .select()
    .from(runEventsTable)
    .where(
      and(
        eq(runEventsTable.threadId, threadId),
        eq(runEventsTable.runId, runId),
        eq(runEventsTable.seq, seq),
      ),
    )
    .get();
  if (!target) {
    return { removed: null, runDeleted: false };
  }
  const removed = rowToEvent(target);
  tx.delete(runEventsTable)
    .where(and(eq(runEventsTable.runId, runId), eq(runEventsTable.seq, seq)))
    .run();
  const deleted = deleteEmptiedRuns(tx, new Set([runId])).length > 0;
  if (target.type === 'run.failed' || target.type === 'error') {
    clearThreadLastErrorForRuns(tx, threadId, new Set([runId]));
  }
  return { removed, runDeleted: deleted };
}

function deleteEmptiedRuns(tx: OrgSqliteDb, runIds: Set<string>): string[] {
  const removed: string[] = [];
  for (const id of runIds) {
    const left = tx
      .select({ seq: runEventsTable.seq })
      .from(runEventsTable)
      .where(eq(runEventsTable.runId, id))
      .limit(1)
      .get();
    if (!left) {
      tx.delete(runsTable).where(eq(runsTable.runId, id)).run();
      removed.push(id);
    }
  }
  return removed;
}

function createdAtOf(known: Map<string, string>, runId: string): string {
  return known.get(runId) ?? '';
}

function clearThreadLastErrorForRuns(tx: OrgSqliteDb, threadId: string, runIds: Set<string>): void {
  if (runIds.size === 0) {
    return;
  }
  const row = tx
    .select({ metadata: threadsTable.metadata })
    .from(threadsTable)
    .where(eq(threadsTable.id, threadId))
    .get();
  if (!row) {
    return;
  }
  const metadata = parseThreadMetadata(row.metadata);
  const lastError = metadata.lastError;
  if (!lastError || typeof lastError !== 'object' || Array.isArray(lastError)) {
    return;
  }
  const runId = (lastError as Record<string, unknown>).runId;
  if (typeof runId !== 'string' || !runIds.has(runId)) {
    return;
  }
  delete metadata.lastError;
  tx.update(threadsTable)
    .set({ metadata: JSON.stringify(metadata) })
    .where(eq(threadsTable.id, threadId))
    .run();
}

function parseThreadMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
