import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const departmentsTable = sqliteTable(
  'departments',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    parentId: text('parent_id'),
    leadAgentId: text('lead_agent_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex('departments_org_id_name_unique').on(table.orgId, table.name),
  }),
);

export type DepartmentRow = typeof departmentsTable.$inferSelect;
export type DepartmentInsert = typeof departmentsTable.$inferInsert;
