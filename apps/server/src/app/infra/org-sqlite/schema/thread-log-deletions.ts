import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const threadLogDeletionsTable = sqliteTable(
  'thread_log_deletions',
  {
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    fromThreadSeq: integer('from_thread_seq').notNull(),
    toThreadSeq: integer('to_thread_seq').notNull(),
    deletedAt: integer('deleted_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.fromThreadSeq] }),
    threadIdx: index('thread_log_deletions_thread_idx').on(table.threadId),
  }),
);

export type ThreadLogDeletionRow = typeof threadLogDeletionsTable.$inferSelect;
export type ThreadLogDeletionInsert = typeof threadLogDeletionsTable.$inferInsert;
