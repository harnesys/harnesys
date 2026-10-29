import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const fileAccessRulesTable = sqliteTable(
  'file_access_rules',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentId: text('agent_id'),
    hostId: text('host_id'),
    pathPattern: text('path_pattern').notNull(),
    action: text('action').notNull(),
    effect: text('effect').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgAgentIdx: index('file_access_rules_org_agent_idx').on(table.orgId, table.agentId),
    orgHostIdx: index('file_access_rules_org_host_idx').on(table.orgId, table.hostId),
  }),
);

export type FileRuleRow = typeof fileAccessRulesTable.$inferSelect;
export type FileRuleInsertRow = typeof fileAccessRulesTable.$inferInsert;
