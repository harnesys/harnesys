import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Attachment } from 'harnesys';
import type { OrgSqliteDb } from './org-sqlite-session.ts';
import { threadMessageQueueTable } from './schema/index.ts';

export interface QueuedThreadMessage {
  itemId: string;
  threadId: string;
  text: string;
  attachments: Attachment[] | null;
  origin: string | null;
  clientEventId: string | null;
  queuedAt: string;
  deliveredAt: string | null;
}

export interface EnqueueThreadMessageInput {
  threadId: string;
  text: string;
  attachments?: Attachment[] | null;
  origin?: string | null;
  clientEventId?: string | null;
}

export function enqueueThreadMessage(
  db: OrgSqliteDb,
  input: EnqueueThreadMessageInput,
): string | null {
  const itemId = crypto.randomUUID();
  const inserted = db
    .insert(threadMessageQueueTable)
    .values({
      itemId,
      threadId: input.threadId,
      text: input.text,
      ...(input.attachments ? { attachments: JSON.stringify(input.attachments) } : {}),
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.clientEventId ? { clientEventId: input.clientEventId } : {}),
      queuedAt: new Date().toISOString(),
    })
    .onConflictDoNothing({ target: threadMessageQueueTable.clientEventId })
    .returning({ itemId: threadMessageQueueTable.itemId })
    .get();
  return inserted?.itemId ?? null;
}

export function listQueuedThreadMessages(db: OrgSqliteDb, threadId: string): QueuedThreadMessage[] {
  return db
    .select()
    .from(threadMessageQueueTable)
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        isNull(threadMessageQueueTable.deliveredAt),
      ),
    )
    .orderBy(asc(threadMessageQueueTable.queuedAt), asc(threadMessageQueueTable.itemId))
    .all()
    .map(mapRow);
}

export function listUndeliveredThreadMessages(
  db: OrgSqliteDb,
  threadId: string,
): QueuedThreadMessage[] {
  return db
    .select()
    .from(threadMessageQueueTable)
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        isNull(threadMessageQueueTable.deliveredAt),
      ),
    )
    .orderBy(asc(threadMessageQueueTable.queuedAt), asc(threadMessageQueueTable.itemId))
    .all()
    .map(mapRow);
}

export function headQueuedThreadMessage(
  db: OrgSqliteDb,
  threadId: string,
): QueuedThreadMessage | null {
  const row = db
    .select()
    .from(threadMessageQueueTable)
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        isNull(threadMessageQueueTable.deliveredAt),
      ),
    )
    .orderBy(asc(threadMessageQueueTable.queuedAt), asc(threadMessageQueueTable.itemId))
    .get();
  return row ? mapRow(row) : null;
}

export function getQueuedThreadMessage(
  db: OrgSqliteDb,
  threadId: string,
  itemId: string,
): QueuedThreadMessage | null {
  const row = db
    .select()
    .from(threadMessageQueueTable)
    .where(
      and(
        eq(threadMessageQueueTable.threadId, threadId),
        eq(threadMessageQueueTable.itemId, itemId),
      ),
    )
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

function mapRow(row: typeof threadMessageQueueTable.$inferSelect): QueuedThreadMessage {
  return {
    itemId: row.itemId,
    threadId: row.threadId,
    text: row.text,
    attachments: row.attachments ? (JSON.parse(row.attachments) as Attachment[]) : null,
    origin: row.origin,
    clientEventId: row.clientEventId,
    queuedAt: row.queuedAt,
    deliveredAt: row.deliveredAt,
  };
}
