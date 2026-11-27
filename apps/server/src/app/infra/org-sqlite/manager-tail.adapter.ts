import { Injectable } from '@harnesys/brix';
import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { ManagerThreadTailItem, SessionEvent } from 'harnesys';
import { STREAM_DELTA_EVENT_TYPES } from '../../domain/events/stream-delta-event-types.ts';
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
        .where(
          and(
            eq(runEventsTable.threadId, threadId),
            notInArray(runEventsTable.type, [...STREAM_DELTA_EVENT_TYPES]),
          ),
        )
        .orderBy(desc(runEventsTable.timestamp), desc(runEventsTable.seq))
        .limit(Math.min(4 * limit, 2000))
        .all();
      const collapsed = collapseSettledToolRequests(rows).map(rowToItem).reverse();
      return collapsed.slice(Math.max(0, collapsed.length - limit));
    });
  }
}

const TOOL_EVENT_TYPE = 'tool';
const SETTLED_TOOL_PHASES: readonly string[] = ['completed', 'failed'];

function collapseSettledToolRequests(rows: RunEventRow[]): RunEventRow[] {
  const settled = new Set<string>();
  for (const row of rows) {
    if (row.type !== TOOL_EVENT_TYPE) {
      continue;
    }
    const meta = metaOf(row);
    const phase = typeof meta?.phase === 'string' ? meta.phase : '';
    const key = meta === null ? null : toolCallKey(row.runId, meta);
    if (key !== null && SETTLED_TOOL_PHASES.includes(phase)) {
      settled.add(key);
    }
  }
  return rows.filter((row) => {
    if (row.type !== TOOL_EVENT_TYPE) {
      return true;
    }
    const meta = metaOf(row);
    const phase = typeof meta?.phase === 'string' ? meta.phase : '';
    if (phase === 'streaming') {
      return false;
    }
    if (phase === '') {
      return true;
    }
    if (SETTLED_TOOL_PHASES.includes(phase)) {
      return true;
    }
    const key = meta === null ? null : toolCallKey(row.runId, meta);
    return key === null || !settled.has(key);
  });
}

function metaOf(row: RunEventRow): Record<string, unknown> | null {
  try {
    return row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toolCallKey(runId: string | null, meta: Record<string, unknown>): string | null {
  const id = meta.toolCallId;
  return typeof id === 'string' && id !== '' ? `${runId ?? ''}:${id}` : null;
}

function rowToItem(row: RunEventRow): ManagerThreadTailItem {
  return {
    seq: row.seq ?? row.threadSeq,
    runId: row.runId ?? '',
    kind: row.type,
    at: new Date(row.timestamp).toISOString(),
    preview: previewOf(rowToEvent(row)),
  };
}

function previewOf(event: SessionEvent): string | null {
  const record: Record<string, unknown> = { ...event };
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
