import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const permissionGrantsTable = sqliteTable(
  'permission_grants',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentId: text('agent_id').notNull(),
    operation: text('operation').notNull(),
    decidedBy: text('decided_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    agentOperationUnique: uniqueIndex('permission_grants_agent_operation').on(
      table.orgId,
      table.agentId,
      table.operation,
    ),
  }),
);

export type PermissionGrantRow = typeof permissionGrantsTable.$inferSelect;
export type PermissionGrantInsert = typeof permissionGrantsTable.$inferInsert;
