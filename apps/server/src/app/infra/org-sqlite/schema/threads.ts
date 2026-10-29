import { sql } from 'drizzle-orm';
import { type AnySQLiteColumn, check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { issuesTable } from './issues.ts';

export const threadsTable = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    originAgentId: text('origin_agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    kind: text('kind', { enum: ['chat', 'schedule', 'webhook', 'issue', 'connector'] })
      .notNull()
      .default('chat'),
    parentThreadId: text('parent_thread_id').references((): AnySQLiteColumn => threadsTable.id, {
      onDelete: 'set null',
    }),
    forkAt: text('fork_at'),
    inheritedEventCount: text('inherited_event_count').notNull().default('0'),
    metadata: text('metadata').notNull().default('{}'),
    issueId: text('issue_id').references((): AnySQLiteColumn => issuesTable.id, {
      onDelete: 'cascade',
    }),
    runProfileId: text('run_profile_id'),
    runDirectory: text('run_directory'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastReadAt: text('last_read_at').notNull(),
  },
  (table) => ({
    kindCheck: check(
      'threads_kind_check',
      sql`${table.kind} IN ('chat', 'schedule', 'webhook', 'issue', 'connector')`,
    ),
    orgIdx: index('threads_org_idx').on(table.orgId),
    agentIdx: index('threads_agent_idx').on(table.agentId),
    issueIdx: index('threads_issue_idx').on(table.issueId),
  }),
);

export type ThreadRow = typeof threadsTable.$inferSelect;
export type ThreadInsert = typeof threadsTable.$inferInsert;
