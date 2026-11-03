import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { issuesTable } from './issues.ts';

export const threadsTable = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    title: text('title').notNull(),
    kind: text('kind', {
      enum: ['chat', 'group', 'schedule', 'webhook', 'issue', 'connector'],
    })
      .notNull()
      .default('chat'),
    autoReplyAgentId: text('auto_reply_agent_id').references(
      (): AnySQLiteColumn => agentsTable.id,
      {
        onDelete: 'set null',
      },
    ),
    policy: text('policy').notNull().default('{"version":1}'),
    lastThreadSeq: integer('last_thread_seq').notNull().default(0),
    conversationCount: integer('conversation_count').notNull().default(0),
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
      sql`${table.kind} IN ('chat', 'group', 'schedule', 'webhook', 'issue', 'connector')`,
    ),
    orgIdx: index('threads_org_idx').on(table.orgId),
    issueIdx: index('threads_issue_idx').on(table.issueId),
  }),
);

export const threadAgentsTable = sqliteTable(
  'thread_agents',
  {
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.threadId, table.agentId] }),
    agentIdx: index('thread_agents_agent_idx').on(table.agentId),
  }),
);

export type ThreadRow = typeof threadsTable.$inferSelect;
export type ThreadInsert = typeof threadsTable.$inferInsert;
export type ThreadAgentRow = typeof threadAgentsTable.$inferSelect;
