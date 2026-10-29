import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { threadsTable } from './threads.ts';

export const webhooksTable = sqliteTable(
  'webhooks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    status: text('status', { enum: ['active', 'paused', 'failed'] })
      .notNull()
      .default('active'),
    targetAgentId: text('target_agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    detail: text('detail').notNull().default(''),
    endpoint: text('endpoint').notNull(),
    threadId: text('thread_id')
      .notNull()
      .references((): AnySQLiteColumn => threadsTable.id),
    lastFiredAt: text('last_fired_at'),
    createdByUserId: text('created_by_user_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'webhooks_status_check',
      sql`${table.status} IN ('active', 'paused', 'failed')`,
    ),
    orgIdx: index('webhooks_org_idx').on(table.orgId),
    threadIdx: uniqueIndex('webhooks_thread_idx').on(table.threadId),
  }),
);

export type WebhookRow = typeof webhooksTable.$inferSelect;
export type WebhookInsert = typeof webhooksTable.$inferInsert;
