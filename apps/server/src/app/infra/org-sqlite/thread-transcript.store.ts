import { and, eq, sql } from 'drizzle-orm';
import type { Attachment } from 'harnesys';
import { ThreadValidationException } from '../../domain/thread/thread.error.ts';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import { runEventsTable, threadsTable } from './schema/index.ts';

export interface ThreadAuthor {
  provider: string;
  providerUserId: string;
  displayName: string;
}

export interface AppendPeopleMessageInput {
  threadId: string;
  text: string;
  attachments?: Attachment[] | null;
  origin?: string | null;
  originConnectorId?: string | null;
  clientEventId?: string | null;
  author?: ThreadAuthor | null;
}

export interface AppendPeopleMessageResult {
  threadSeq: number;
  duplicate: boolean;
}

export function nextThreadSeq(tx: OrgSqliteDb, threadId: string): number {
  const row = tx
    .update(threadsTable)
    .set({ lastThreadSeq: sql`${threadsTable.lastThreadSeq} + 1` })
    .where(eq(threadsTable.id, threadId))
    .returning({ threadSeq: threadsTable.lastThreadSeq })
    .get();
  if (!row) {
    throw new ThreadValidationException(`thread not found: ${threadId}`);
  }
  return row.threadSeq;
}

export function bumpConversationCount(tx: OrgSqliteDb, threadId: string, delta: number): void {
  if (delta === 0) {
    return;
  }
  tx.update(threadsTable)
    .set({ conversationCount: sql`MAX(0, ${threadsTable.conversationCount} + ${delta})` })
    .where(eq(threadsTable.id, threadId))
    .run();
}

export function appendPeopleMessage(
  tx: OrgSqliteDb,
  input: AppendPeopleMessageInput,
): AppendPeopleMessageResult {
  if (input.clientEventId) {
    const existing = tx
      .select({ threadSeq: runEventsTable.threadSeq })
      .from(runEventsTable)
      .where(
        and(
          eq(runEventsTable.threadId, input.threadId),
          eq(runEventsTable.clientEventId, input.clientEventId),
          eq(runEventsTable.conversational, 1),
        ),
      )
      .get();
    if (existing) {
      return { threadSeq: existing.threadSeq, duplicate: true };
    }
  }
  const threadSeq = nextThreadSeq(tx, input.threadId);
  const event = {
    type: 'user',
    text: input.text,
    ...(input.attachments && input.attachments.length > 0
      ? { attachments: input.attachments }
      : {}),
    ...(input.origin ? { origin: input.origin } : {}),
    ...(input.originConnectorId ? { originConnectorId: input.originConnectorId } : {}),
    ...(input.clientEventId ? { clientEventId: input.clientEventId } : {}),
    ...(input.author ? { author: input.author } : {}),
  };
  tx.insert(runEventsTable)
    .values({
      threadId: input.threadId,
      threadSeq,
      runId: null,
      seq: null,
      type: 'user',
      timestamp: Date.now(),
      metadata: JSON.stringify(event),
      clientEventId: input.clientEventId ?? null,
      conversational: 1,
    })
    .run();
  bumpConversationCount(tx, input.threadId, 1);
  return { threadSeq, duplicate: false };
}

export interface ConversationalEventRow {
  threadSeq: number;
  type: string;
  metadata: Record<string, unknown>;
}

export function getThreadEventRow(
  db: OrgSqliteDb,
  threadId: string,
  threadSeq: number,
): ConversationalEventRow | undefined {
  const row = db
    .select({
      threadSeq: runEventsTable.threadSeq,
      type: runEventsTable.type,
      metadata: runEventsTable.metadata,
    })
    .from(runEventsTable)
    .where(and(eq(runEventsTable.threadId, threadId), eq(runEventsTable.threadSeq, threadSeq)))
    .get();
  return row
    ? { threadSeq: row.threadSeq, type: row.type, metadata: parseMetadata(row.metadata) }
    : undefined;
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
