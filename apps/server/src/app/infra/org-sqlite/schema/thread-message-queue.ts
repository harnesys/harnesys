import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const threadMessageQueueTable = sqliteTable(
  'thread_message_queue',
  {
    itemId: text('item_id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threadsTable.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    attachments: text('attachments'),
    origin: text('origin'),
    clientEventId: text('client_event_id').unique(),
    queuedAt: text('queued_at').notNull(),
    deliveredAt: text('delivered_at'),
  },
  (table) => ({
    threadIdx: index('thread_message_queue_thread_idx').on(table.threadId, table.queuedAt),
  }),
);

export type ThreadMessageQueueRow = typeof threadMessageQueueTable.$inferSelect;
export type ThreadMessageQueueInsert = typeof threadMessageQueueTable.$inferInsert;
