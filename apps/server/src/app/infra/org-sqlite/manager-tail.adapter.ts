import { Injectable } from '@harnesys/brix';
import { desc, eq } from 'drizzle-orm';
import type { ManagerThreadTailItem, SessionEvent } from 'harnesys';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ManagerTailPort } from '../../domain/manager/manager-tail.port.ts';
import { rowToEvent } from '../runtime/sqlite-thread-truncate.ts';
import { withOrgSqlite } from './org-sqlite-session.ts';
import type { RunEventRow } from './schema/index.ts';
import { runEventsTable } from './schema/index.ts';

const PREVIEW_MAX_CHARS = 200;
const PREVIEW_TEXT_FIELDS: readonly string[] = ['text', 'message', 'prompt', 'summary', 'reason'];

@Injectable()
export class ManagerTailAdapter extends ManagerTailPort {
  constructor(private readonly layout: HostFsLayoutPort) {
    super();
  }

  tail(orgId: string, threadId: string, limit: number): ManagerThreadTailItem[] {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const rows = db
        .select()
        .from(runEventsTable)
        .where(eq(runEventsTable.threadId, threadId))
        .orderBy(desc(runEventsTable.timestamp), desc(runEventsTable.seq))
        .limit(limit)
        .all();
      return rows.map(rowToItem).reverse();
    });
  }
}

function rowToItem(row: RunEventRow): ManagerThreadTailItem {
  return {
    seq: row.seq,
    runId: row.runId,
    kind: row.type,
    at: new Date(row.timestamp).toISOString(),
    preview: previewOf(rowToEvent(row)),
  };
}

function previewOf(event: SessionEvent): string | null {
  const record: Record<string, unknown> = event;
  for (const field of PREVIEW_TEXT_FIELDS) {
    const value = record[field];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.slice(0, PREVIEW_MAX_CHARS);
    }
  }
  if (event.type === 'tool' && typeof event.name === 'string') {
    return event.name.slice(0, PREVIEW_MAX_CHARS);
  }
  return null;
}
