import { type AnySQLiteColumn, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const attachmentsTable = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mediaType: text('media_type').notNull(),
    kind: text('kind').notNull().default('file'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    path: text('path'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    threadIdx: index('attachments_thread_idx').on(table.threadId),
  }),
);

export type AttachmentRow = typeof attachmentsTable.$inferSelect;
export type AttachmentInsert = typeof attachmentsTable.$inferInsert;
