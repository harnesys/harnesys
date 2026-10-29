import { and, desc, eq, like } from 'drizzle-orm';
import type { EpisodicHit, EpisodicIndexInput, EpisodicPort, EpisodicSearchInput } from 'harnesys';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { runEventsTable } from '../../org-sqlite/schema/run-events.ts';
import { threadsTable } from '../../org-sqlite/schema/threads.ts';

const DEFAULT_SEARCH_LIMIT = 20;

interface EpisodicScanRow {
  runId: string;
  seq: number;
  threadId: string;
  metadata: string | null;
}

export class OrgEpisodicPort implements EpisodicPort {
  constructor(private readonly db: OrgSqliteDb) {}

  index(_input: EpisodicIndexInput): Promise<void> {
    return Promise.resolve();
  }

  search(input: EpisodicSearchInput): Promise<EpisodicHit[]> {
    const limit = resolveLimit(input.limit);
    const conditions = [
      eq(threadsTable.orgId, input.orgId),
      like(runEventsTable.metadata, `%${input.query}%`),
    ];
    if (input.threadId !== undefined && input.threadId !== '') {
      conditions.push(eq(runEventsTable.threadId, input.threadId));
    }
    if (input.agentId !== undefined && input.agentId !== '') {
      conditions.push(like(runEventsTable.metadata, `%"agentId":"${input.agentId}"%`));
    }
    const rows = this.db
      .select({
        runId: runEventsTable.runId,
        seq: runEventsTable.seq,
        threadId: runEventsTable.threadId,
        metadata: runEventsTable.metadata,
      })
      .from(runEventsTable)
      .innerJoin(threadsTable, eq(threadsTable.id, runEventsTable.threadId))
      .where(and(...conditions))
      .orderBy(desc(runEventsTable.timestamp), desc(runEventsTable.seq))
      .limit(limit)
      .all();
    return Promise.resolve(rows.map(toHit));
  }
}

function resolveLimit(limit: number | undefined): number {
  return limit !== undefined && Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;
}

function toHit(row: EpisodicScanRow): EpisodicHit {
  return {
    threadId: row.threadId,
    entryId: row.runId,
    seq: row.seq,
    text: textOf(row.metadata),
  };
}

function textOf(metadata: string | null): string {
  if (metadata === null) {
    return '';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata) as unknown;
  } catch {
    return metadata;
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const text = (parsed as Record<string, unknown>).text;
    if (typeof text === 'string') {
      return text;
    }
  }
  return metadata;
}
