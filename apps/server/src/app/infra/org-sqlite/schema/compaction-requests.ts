import { type AnySQLiteColumn, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threadsTable } from './threads.ts';

export const compactionRequestsTable = sqliteTable(
  'compaction_requests',
  {
    requestId: text('request_id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    targetRunId: text('target_run_id').notNull(),
    status: text('status').notNull(),
    outcomeJson: text('outcome_json'),
    queuedAt: text('queued_at').notNull(),
    settledAt: text('settled_at'),
  },
  (table) => ({
    threadIdx: index('compaction_requests_thread_idx').on(table.threadId, table.status),
  }),
);
