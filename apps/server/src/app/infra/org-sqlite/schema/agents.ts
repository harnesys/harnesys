import { real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const agentsTable = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    instructions: text('instructions').notNull(),
    model: text('model').notNull(),
    config: text('config').notNull().default('{}'),
    budgetUsdDaily: real('budget_usd_daily'),
    level: text('level').notNull().default('top'),
    parentId: text('parent_id'),
    placement: text('placement').notNull().default('{"prefer":"any"}'),
    executionProfileId: text('execution_profile_id'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex('agents_org_id_name_unique').on(table.orgId, table.name),
  }),
);

export type AgentRow = typeof agentsTable.$inferSelect;
export type AgentInsert = typeof agentsTable.$inferInsert;
