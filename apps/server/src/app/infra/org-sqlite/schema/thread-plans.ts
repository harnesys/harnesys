import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const threadPlansTable = sqliteTable(
  'thread_plans',
  {
    orgId: text('org_id').notNull(),
    threadId: text('thread_id').notNull(),
    snapshotJson: text('snapshot_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(''),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgIdx: index('thread_plans_org_idx').on(table.orgId),
    threadIdx: uniqueIndex('thread_plans_thread_idx').on(table.threadId),
  }),
);

export type ThreadPlanRow = typeof threadPlansTable.$inferSelect;
export type ThreadPlanInsert = typeof threadPlansTable.$inferInsert;
