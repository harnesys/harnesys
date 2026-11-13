import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Attachment } from 'harnesys';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import { runEventsTable, threadMessageQueueTable } from './schema/index.ts';
import { appendPeopleMessage } from './thread-transcript.store.ts';

export interface QueuedThreadMessage {
  itemId: string;
  threadId: string;
  threadSeq: number | null;
  targetAgentId: string | null;
  text: string;
  attachments: Attachment[] | null;
  origin: string | null;
  originConnectorId: string | null;
  clientEventId: string | null;
  mode: string | null;
  queuedAt: string;
  deliveredAt: string | null;
}

export interface EnqueueThreadMessageInput {
  threadId: string;
  text: string;
  attachments?: Attachment[] | null;
  origin?: string | null;
  originConnectorId?: string | null;
  clientEventId?: string | null;
  mode?: string | null;
  author?: { provider: string; providerUserId: string; displayName: string } | null;
  targetAgentIds?: string[];
  threadScoped?: boolean;
}

export interface EnqueueThreadMessageResult {
  threadSeq: number | null;
  itemIds: string[];
  duplicate: boolean;
}

function insertTargets(
  tx: OrgSqliteDb,
  input: EnqueueThreadMessageInput,
  targets: string[],
  threadSeq: number,
): string[] {
  const itemIds: string[] = [];
  for (const targetAgentId of targets) {
    const inserted = tx
      .insert(threadMessageQueueTable)
      .values({
        itemId: crypto.randomUUID(),
        threadId: input.threadId,
        threadSeq,
        targetAgentId,
        ...(input.mode ? { mode: input.mode } : {}),
        queuedAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .returning({ itemId: threadMessageQueueTable.itemId })
      .get();
    if (inserted) {
      itemIds.push(inserted.itemId);
    }
  }
  return itemIds;
}

function enqueueSingle(
  tx: OrgSqliteDb,
  input: EnqueueThreadMessageInput,
): EnqueueThreadMessageResult {
  const duplicate =
    input.clientEventId &&
    tx
      .select({ itemId: threadMessageQueueTable.itemId })
      .from(threadMessageQueueTable)
      .where(
        and(
          eq(threadMessageQueueTable.threadId, input.threadId),
          eq(threadMessageQueueTable.clientEventId, input.clientEventId),
        ),
      )
      .get();
  if (duplicate) {
    return { threadSeq: null, itemIds: [], duplicate: true };
  }
  const inserted = tx
    .insert(threadMessageQueueTable)
    .values({
      itemId: crypto.randomUUID(),
      threadId: input.threadId,
      text: input.text,
      ...(input.attachments ? { attachments: JSON.stringify(input.attachments) } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.clientEventId ? { clientEventId: input.clientEventId } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.targetAgentIds?.[0] ? { targetAgentId: input.targetAgentIds[0] } : {}),
      queuedAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ itemId: threadMessageQueueTable.itemId })
    .get();
  return {
    threadSeq: null,
    itemIds: inserted ? [inserted.itemId] : [],
    duplicate: !inserted,
  };
}

export function enqueueThreadMessage(
  tx: OrgSqliteDb,
  input: EnqueueThreadMessageInput,
): EnqueueThreadMessageResult {
  if (!input.threadScoped) {
    return enqueueSingle(tx, input);
  }
  const targets = input.targetAgentIds ?? [];
  const people = appendPeopleMessage(tx, {
    threadId: input.threadId,
    text: input.text,
    attachments: input.attachments ?? null,
    origin: input.origin ?? null,
    originConnectorId: input.originConnectorId ?? null,
    clientEventId: input.clientEventId ?? null,
    author: input.author ?? null,
  });
  if (people.duplicate) {
    return { threadSeq: people.threadSeq, itemIds: [], duplicate: true };
  }
  return {
    threadSeq: people.threadSeq,
    itemIds: insertTargets(tx, input, targets, people.threadSeq),
    duplicate: false,
  };
}

function selectQueued(db: OrgSqliteDb, threadId: string) {
  return db
    .select({ queue: threadMessageQueueTable, event: runEventsTable })
    .from(threadMessageQueueTable)
    .leftJoin(
      runEventsTable,
      and(
        eq(runEventsTable.threadId, threadMessageQueueTable.threadId),
        eq(runEventsTable.threadSeq, threadMessageQueueTable.threadSeq),
      ),
    )
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        isNull(threadMessageQueueTable.deliveredAt),
      ),
    )
    .orderBy(asc(threadMessageQueueTable.queuedAt));
}

export function listQueuedThreadMessages(
  db: OrgSqliteDb,
  threadId: string,
  targetAgentId?: string,
): QueuedThreadMessage[] {
  return selectQueued(db, threadId)
    .all()
    .map(mapRow)
    .filter((item) => targetAgentId === undefined || item.targetAgentId === targetAgentId);
}

export function listUndeliveredThreadMessages(
  db: OrgSqliteDb,
  threadId: string,
): QueuedThreadMessage[] {
  return listQueuedThreadMessages(db, threadId);
}

export function headQueuedThreadMessage(
  db: OrgSqliteDb,
  threadId: string,
  targetAgentId?: string,
): QueuedThreadMessage | null {
  const rows = selectQueued(db, threadId);
  const filtered = rows.all().map(mapRow);
  return (
    filtered.find((item) => targetAgentId === undefined || item.targetAgentId === targetAgentId) ??
    null
  );
}

export function getQueuedThreadMessage(
  db: OrgSqliteDb,
  threadId: string,
  itemId: string,
): QueuedThreadMessage | null {
  const rows = selectQueued(db, threadId)
    .all()
    .map(mapRow)
    .filter((item) => item.itemId === itemId);
  return rows[0] ?? null;
}

export function latestDeliveredThreadMessage(
  db: OrgSqliteDb,
  threadId: string,
  targetAgentId: string,
): QueuedThreadMessage | null {
  const row = db
    .select({ queue: threadMessageQueueTable, event: runEventsTable })
    .from(threadMessageQueueTable)
    .leftJoin(
      runEventsTable,
      and(
        eq(runEventsTable.threadId, threadMessageQueueTable.threadId),
        eq(runEventsTable.threadSeq, threadMessageQueueTable.threadSeq),
      ),
    )
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        eq(threadMessageQueueTable.targetAgentId, targetAgentId),
      ),
    )
    .orderBy(desc(threadMessageQueueTable.threadSeq))
    .limit(1)
    .get();
  return row ? mapRow(row) : null;
}

export function markThreadMessageDelivered(db: OrgSqliteDb, itemId: string, deliveredAt: string) {
  db.update(threadMessageQueueTable)
    .set({ deliveredAt })
    .where(eq(threadMessageQueueTable.itemId, itemId))
    .run();
}

export function clearThreadMessageDelivered(db: OrgSqliteDb, itemId: string): void {
  db.update(threadMessageQueueTable)
    .set({ deliveredAt: null })
    .where(eq(threadMessageQueueTable.itemId, itemId))
    .run();
}

export function deleteQueuedThreadMessage(db: OrgSqliteDb, threadId: string, itemId: string) {
  return db
    .delete(threadMessageQueueTable)
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        eq(threadMessageQueueTable.itemId, itemId),
        isNull(threadMessageQueueTable.deliveredAt),
      ),
    )
    .returning({ itemId: threadMessageQueueTable.itemId })
    .all();
}

interface QueueJoinRow {
  queue: typeof threadMessageQueueTable.$inferSelect;
  event: typeof runEventsTable.$inferSelect | null;
}

function mapRow(row: QueueJoinRow): QueuedThreadMessage {
  const meta = parseMetadata(row.event?.metadata ?? null);
  const attachments = row.queue.attachments ?? meta.attachments;
  return {
    itemId: row.queue.itemId,
    threadId: row.queue.threadId,
    threadSeq: row.queue.threadSeq ?? null,
    targetAgentId: row.queue.targetAgentId ?? null,
    text: row.queue.text ?? (typeof meta.text === 'string' ? meta.text : ''),
    attachments: parseAttachments(attachments),
    origin: row.queue.origin ?? (typeof meta.origin === 'string' ? meta.origin : null),
    originConnectorId: typeof meta.originConnectorId === 'string' ? meta.originConnectorId : null,
    clientEventId:
      row.queue.clientEventId ??
      (typeof meta.clientEventId === 'string' ? meta.clientEventId : null),
    mode: row.queue.mode ?? (typeof meta.mode === 'string' ? meta.mode : null),
    queuedAt: row.queue.queuedAt,
    deliveredAt: row.queue.deliveredAt ?? null,
  };
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

function parseAttachments(raw: unknown): Attachment[] | null {
  if (Array.isArray(raw)) {
    return raw as Attachment[];
  }
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Attachment[]) : null;
  } catch {
    return null;
  }
}
