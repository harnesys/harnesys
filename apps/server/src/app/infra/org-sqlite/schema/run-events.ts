import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { runsTable } from './runs.ts';
import { threadsTable } from './threads.ts';

export const runEventsTable = sqliteTable(
  'run_events',
  {
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    threadSeq: integer('thread_seq').notNull(),
    runId: text('run_id').references((): AnySQLiteColumn => runsTable.runId, {
      onDelete: 'cascade',
    }),
    seq: integer('seq'),
    type: text('type').notNull(),
    timestamp: integer('timestamp').notNull(),
    metadata: text('metadata'),
    clientEventId: text('client_event_id'),
    conversational: integer('conversational').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.threadSeq] }),
    runSeqIdx: uniqueIndex('run_events_run_seq_idx')
      .on(table.runId, table.seq)
      .where(sql`run_id IS NOT NULL AND seq IS NOT NULL`),
    clientIdx: uniqueIndex('run_events_client_idx')
      .on(table.threadId, table.clientEventId)
      .where(sql`conversational = 1 AND client_event_id IS NOT NULL`),
    conversationIdx: index('run_events_conversation_idx')
      .on(table.threadId, table.threadSeq)
      .where(sql`conversational = 1`),
  }),
);

export type RunEventRow = typeof runEventsTable.$inferSelect;
export type RunEventInsert = typeof runEventsTable.$inferInsert;
