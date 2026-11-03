import { and, eq, gte } from 'drizzle-orm';
import { codedRunError, type SessionEvent, type TruncateThreadResult } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  type RunEventRow,
  runEventsTable,
  runsTable,
  threadsTable,
} from '../org-sqlite/schema/index.ts';
import { bumpConversationCount } from '../org-sqlite/thread-transcript.store.ts';

export interface RemoveThreadEventResult {
  removed: SessionEvent | null;
  runDeleted: boolean;
}

export function rowToEvent(
  row: RunEventRow,
  agent?: { id?: string | null; name?: string | null },
): SessionEvent {
  const meta = row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : {};
  return {
    ...(meta as object),
    type: row.type,
    ...(row.seq === null ? {} : { seq: row.seq }),
    ...(row.runId === null ? {} : { runId: row.runId }),
    ...(agent?.id ? { agentId: agent.id } : {}),
    ...(agent?.name ? { agentName: agent.name } : {}),
    threadSeq: row.threadSeq,
    conversational: row.conversational === 1,
  } as SessionEvent;
}

export function truncateThreadEvents(
  tx: OrgSqliteDb,
  threadId: string,
  threadSeq: number,
): TruncateThreadResult {
  const target = tx
    .select()
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.threadSeq, threadSeq)))
    .get();
  if (!target) {
    throw codedRunError('unknown_event', `event ${threadId}:${threadSeq} not found`);
  }
  const cutoff = rowToEvent(target);
  const tail = tx
    .select()
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), gte(runEventsTable.threadSeq, threadSeq)))
    .all();
  for (const row of tail) {
    tx.delete(runEventsTable)
      .where(
        and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.threadSeq, row.threadSeq)),
      )
      .run();
  }
  const conversational = tail.filter((row) => row.conversational === 1).length;
  bumpConversationCount(tx, threadId, -conversational);
  const tailRunIds = new Set(
    tail.map((row) => row.runId).filter((runId): runId is string => runId !== null),
  );
  const removedRunIds = deleteEmptiedRuns(tx, tailRunIds);
  clearThreadLastErrorForRuns(tx, threadId, tailRunIds);
  const remainingUserCount = tx
    .select({ threadSeq: runEventsTable.threadSeq })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.type, 'user')))
    .all().length;
  return { cutoff, removedEvents: tail.length, removedRunIds, remainingUserCount };
}

export function removeThreadEventRow(
  tx: OrgSqliteDb,
  threadId: string,
  threadSeq: number,
): RemoveThreadEventResult {
  const target = tx
    .select()
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.threadSeq, threadSeq)))
    .get();
  if (!target) {
    return { removed: null, runDeleted: false };
  }
  const removed = rowToEvent(target);
  tx.delete(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.threadSeq, threadSeq)))
    .run();
  if (target.conversational === 1) {
    bumpConversationCount(tx, threadId, -1);
  }
  const runIds = target.runId === null ? new Set<string>() : new Set([target.runId]);
  const deleted = deleteEmptiedRuns(tx, runIds).length > 0;
  if (target.type === 'run.failed' || target.type === 'error') {
    clearThreadLastErrorForRuns(tx, threadId, runIds);
  }
  return { removed, runDeleted: deleted };
}

function deleteEmptiedRuns(tx: OrgSqliteDb, runIds: Set<string>): string[] {
  const removed: string[] = [];
  for (const id of runIds) {
    const left = tx
      .select({ threadSeq: runEventsTable.threadSeq })
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
