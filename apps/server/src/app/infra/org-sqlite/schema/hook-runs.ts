import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const hookRunsTable = sqliteTable(
  'hook_runs',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentId: text('agent_id').notNull(),
    hookId: text('hook_id').notNull(),
    event: text('event').notNull(),
    handlerType: text('handler_type').notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    summary: text('summary'),
    errorCode: text('error_code'),
    effectsJson: text('effects_json').notNull().default('[]'),
    runId: text('run_id'),
    threadId: text('thread_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    agentCreatedIdx: index('hook_runs_agent_created_idx').on(table.agentId, table.createdAt),
  }),
);

export type HookRunRow = typeof hookRunsTable.$inferSelect;
export type HookRunInsert = typeof hookRunsTable.$inferInsert;
