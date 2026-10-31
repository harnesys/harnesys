import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const permissionRulesTable = sqliteTable('permission_rules', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  agentId: text('agent_id'),
  hostId: text('host_id'),
  kind: text('kind').notNull(),
  pattern: text('pattern').notNull(),
  action: text('action'),
  effect: text('effect').notNull(),
  decidedBy: text('decided_by'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type PermissionRuleRow = typeof permissionRulesTable.$inferSelect;
export type PermissionRuleInsert = typeof permissionRulesTable.$inferInsert;
