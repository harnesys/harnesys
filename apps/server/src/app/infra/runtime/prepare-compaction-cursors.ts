import { and, eq } from 'drizzle-orm';
import type { PendingSessionEvent } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable } from '../org-sqlite/schema/index.ts';

type CursorCompaction = Extract<PendingSessionEvent, { type: 'compaction' }>;

function needsThreadCursor(event: PendingSessionEvent): event is CursorCompaction {
  return (
    event.type === 'compaction' &&
    event.coveredUntilThreadSeq === undefined &&
    typeof event.coveredUntilRunId === 'string' &&
    typeof event.coveredUntilSeq === 'number'
  );
}

export function createCompactionCursorPreparer() {
  return function prepareCompactionCursors(
    tx: OrgSqliteDb,
    _runId: string,
    _threadId: string,
    events: PendingSessionEvent[],
  ): PendingSessionEvent[] {
    if (!events.some(needsThreadCursor)) {
      return events;
    }
    return events.map((event) => stampThreadCursor(tx, event));
  };
}

function stampThreadCursor(tx: OrgSqliteDb, event: PendingSessionEvent): PendingSessionEvent {
  if (!needsThreadCursor(event)) {
    return event;
  }
  const boundary = {
    runId: event.coveredUntilRunId as string,
    seq: event.coveredUntilSeq as number,
  };
  const row = tx
    .select({ threadSeq: runEventsTable.threadSeq })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.runId, boundary.runId), eq(runEventsTable.seq, boundary.seq)))
    .get();
  if (!row) {
    return { ...event, durable: false, unresolvedReason: 'boundary-not-persisted' };
  }
  return { ...event, coveredUntilThreadSeq: row.threadSeq };
}
