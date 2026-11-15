import { eq } from 'drizzle-orm';
import { type PendingSessionEvent, rebuildThreadMessages, type SessionEvent } from 'harnesys';
import type { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable } from '../org-sqlite/schema/index.ts';
import { resolveCompactionCursor } from './compaction-cursor.ts';
import { rowToEvent } from './sqlite-thread-truncate.ts';
import { sliceThreadHistory, threadSliceOptsOf } from './thread-history-slice.ts';

type UnstampedCompaction = Extract<PendingSessionEvent, { type: 'compaction' }>;

function isUnstampedCompaction(event: PendingSessionEvent): event is UnstampedCompaction {
  return event.type === 'compaction' && event.coveredUntilThreadSeq === undefined;
}

/**
 * Stamps the thread cursor onto auto-compaction events the engine just emitted.
 * The engine knows message indices only; the mapping from the covered-until
 * message onto a `thread_seq` lives here, computed from the same sliced stream
 * the run was seeded from. Unresolved cursors are stamped `null` explicitly:
 * seeds then keep the full history instead of cutting at the anchor position.
 */
export function createCompactionCursorPreparer(deps: {
  orgId: string;
  threads: ThreadRepositoryPort;
}) {
  return function prepareCompactionCursors(
    tx: OrgSqliteDb,
    runId: string,
    threadId: string,
    events: PendingSessionEvent[],
  ): PendingSessionEvent[] {
    if (!events.some(isUnstampedCompaction)) {
      return events;
    }
    const thread = deps.threads.findById(deps.orgId, threadId);
    let sliced: SessionEvent[] | undefined;
    let sources: number[] | undefined;
    let rebuiltCount = -1;
    if (thread) {
      const listed = tx
        .select()
        .from(runEventsTable)
        .where(eq(runEventsTable.threadId, threadId))
        .orderBy(runEventsTable.threadSeq)
        .all()
        .map((row) => rowToEvent(row));
      sliced = sliceThreadHistory(listed, threadSliceOptsOf(thread, runId));
      sources = [];
      const messages = rebuildThreadMessages(sliced, {
        messageSources: sources,
        activeRunId: runId,
        ...(thread.kind === 'group' ? { speakerAttribution: true } : {}),
      });
      rebuiltCount = messages.length;
    }
    return events.map((event) => {
      if (!isUnstampedCompaction(event)) {
        return event;
      }
      const boundary =
        sliced && sources
          ? resolveCompactionCursor({
              rebuiltCount,
              coveredTotal: event.coveredTotal,
              coveredUntil: event.coveredUntil,
              sources,
              sliced,
            })
          : null;
      return boundary
        ? {
            ...event,
            coveredUntilRunId: boundary.runId,
            coveredUntilSeq: boundary.seq,
            coveredUntilThreadSeq: boundary.threadSeq,
          }
        : { ...event, coveredUntilThreadSeq: null };
    });
  };
}
