import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { PendingSessionEvent } from 'harnesys';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runEventsTable } from '../org-sqlite/schema/index.ts';

export function stampFinalAnswer(
  tx: OrgSqliteDb,
  runId: string,
  events: PendingSessionEvent[],
): PendingSessionEvent[] {
  if (!events.some((event) => event.type === 'run.completed')) {
    return events;
  }
  const fallback = lastUsageText(tx, runId, events);
  return events.map((event) => {
    if (event.type !== 'run.completed') {
      return event;
    }
    const text = (event as { text?: string }).text ?? fallback;
    return text === undefined ? event : ({ ...event, text } as PendingSessionEvent);
  });
}

function lastUsageText(
  tx: OrgSqliteDb,
  runId: string,
  events: PendingSessionEvent[],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === 'model.usage') {
      const text = (event as { text?: string }).text;
      if (typeof text === 'string' && text.length > 0) {
        return text;
      }
    }
  }
  const rows = tx
    .select({ metadata: runEventsTable.metadata })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.runId, runId), isNotNull(runEventsTable.runId)))
    .orderBy(desc(runEventsTable.seq))
    .limit(20)
    .all();
  for (const row of rows) {
    if (!row.metadata) {
      continue;
    }
    try {
      const meta = JSON.parse(row.metadata) as Record<string, unknown>;
      if (typeof meta.text === 'string' && meta.text.length > 0) {
        return meta.text;
      }
    } catch {
      // skip malformed metadata
    }
  }
  return undefined;
}
