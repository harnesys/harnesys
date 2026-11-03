import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { runEventsTable } from './run-events.ts';
import { threadsTable } from './threads.ts';

export const threadMessageQueueTable = sqliteTable(
  'thread_message_queue',
  {
    itemId: text('item_id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    threadSeq: integer('thread_seq'),
    targetAgentId: text('target_agent_id').references((): AnySQLiteColumn => agentsTable.id, {
      onDelete: 'cascade',
    }),
    text: text('text'),
    attachments: text('attachments'),
    origin: text('origin'),
    clientEventId: text('client_event_id'),
    queuedAt: text('queued_at').notNull(),
    deliveredAt: text('delivered_at'),
  },
  (table) => ({
    threadIdx: index('thread_message_queue_thread_idx').on(table.threadId, table.queuedAt),
    eventRef: foreignKey({
      columns: [table.threadId, table.threadSeq],
      foreignColumns: [runEventsTable.threadId, runEventsTable.threadSeq],
      name: 'thread_message_queue_event_fk',
    }).onDelete('cascade'),
    targetIdx: uniqueIndex('thread_message_queue_target_idx')
      .on(table.threadId, table.threadSeq, table.targetAgentId)
      .where(sql`thread_seq IS NOT NULL AND target_agent_id IS NOT NULL`),
  }),
);

export type ThreadMessageQueueRow = typeof threadMessageQueueTable.$inferSelect;
export type ThreadMessageQueueInsert = typeof threadMessageQueueTable.$inferInsert;
