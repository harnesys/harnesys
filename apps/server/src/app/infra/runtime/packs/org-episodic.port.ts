import { and, desc, eq, like } from 'drizzle-orm';
import type { EpisodicHit, EpisodicIndexInput, EpisodicPort, EpisodicSearchInput } from 'harnesys';
import type { OrgSqliteDb } from '../../org-sqlite/org-sqlite-session.ts';
import { runEventsTable } from '../../org-sqlite/schema/run-events.ts';
import { threadsTable } from '../../org-sqlite/schema/threads.ts';

const DEFAULT_SEARCH_LIMIT = 20;

interface EpisodicScanRow {
  runId: string | null;
  seq: number | null;
  threadId: string;
  threadSeq: number;
  type: string;
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
    if (input.conversationalOnly === true) {
      conditions.push(eq(runEventsTable.conversational, 1));
    }
    const rows = this.db
      .select({
        runId: runEventsTable.runId,
        seq: runEventsTable.seq,
        threadId: runEventsTable.threadId,
        threadSeq: runEventsTable.threadSeq,
        type: runEventsTable.type,
        metadata: runEventsTable.metadata,
      })
      .from(runEventsTable)
      .innerJoin(threadsTable, eq(threadsTable.id, runEventsTable.threadId))
      .where(and(...conditions))
      .orderBy(desc(runEventsTable.timestamp), desc(runEventsTable.seq))
      .limit(limit)
      .all();
    return Promise.resolve(
      rows.map((row) =>
        toHit({
          runId: row.runId,
          seq: row.seq,
          threadId: row.threadId,
          threadSeq: row.threadSeq,
          type: row.type,
          metadata: row.metadata,
        }),
      ),
    );
  }
}

function resolveLimit(limit: number | undefined): number {
  return limit !== undefined && Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_SEARCH_LIMIT;
}

function toHit(row: EpisodicScanRow): EpisodicHit {
  const metadata = metadataOf(row.metadata);
  const author = authorOf(metadata);
  const role = roleOf(row.type);
  return {
    threadId: row.threadId,
    threadSeq: row.threadSeq,
    ...(row.runId !== null ? { entryId: row.runId } : {}),
    ...(row.seq !== null ? { seq: row.seq } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(author !== undefined ? { author } : {}),
    text: textOf(metadata, row.metadata),
  };
}

function metadataOf(metadata: string | null): Record<string, unknown> {
  if (metadata === null) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function roleOf(type: string): 'user' | 'assistant' | undefined {
  if (type === 'user') {
    return 'user';
  }
  return type === 'run.completed' ? 'assistant' : undefined;
}

function authorOf(metadata: Record<string, unknown>): string | undefined {
  const author = metadata.author;
  if (!author || typeof author !== 'object' || Array.isArray(author)) {
    return undefined;
  }
  const displayName = (author as Record<string, unknown>).displayName;
  return typeof displayName === 'string' ? displayName : undefined;
}

function textOf(metadata: Record<string, unknown>, raw: string | null): string {
  const text = metadata.text;
  if (typeof text === 'string') {
    return text;
  }
  return raw ?? '';
}
