import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const approvalsTable = sqliteTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    runId: text('run_id').notNull(),
    agentId: text('agent_id').notNull(),
    threadId: text('thread_id'),
    interruptId: text('interrupt_id').notNull(),
    kind: text('kind').notNull(),
    question: text('question').notNull(),
    options: text('options').notNull(),
    context: text('context').notNull().default('{}'),
    status: text('status').notNull().default('pending'),
    decidedBy: text('decided_by'),
    decidedAt: text('decided_at'),
    decisionSeq: integer('decision_seq').notNull().default(0),
    resumeState: text('resume_state').notNull().default('pending'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    runInterruptUnique: uniqueIndex('approvals_run_interrupt')
      .on(table.runId, table.interruptId)
      .where(sql`status <> 'superseded'`),
    statusIdx: index('approvals_status').on(table.status),
  }),
);

export type ApprovalRow = typeof approvalsTable.$inferSelect;
export type ApprovalInsert = typeof approvalsTable.$inferInsert;
