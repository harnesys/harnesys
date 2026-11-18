import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const dashboardsTable = sqliteTable(
  'dashboards',
  {
    orgId: text('org_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    color: text('color'),
    icon: text('icon'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.id] }),
  }),
);

export const dashboardWidgetsTable = sqliteTable(
  'dashboard_widgets',
  {
    orgId: text('org_id').notNull(),
    id: text('id').notNull(),
    dashboardId: text('dashboard_id').notNull(),
    slotJson: text('slot_json').notNull().default('{}'),
    docJson: text('doc_json').notNull().default('{}'),
    status: text('status').notNull().default('active'),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.id] }),
    dashboardIdx: index('dashboard_widgets_org_dashboard_idx').on(table.orgId, table.dashboardId),
  }),
);

export type DashboardRow = typeof dashboardsTable.$inferSelect;
export type DashboardInsertRow = typeof dashboardsTable.$inferInsert;
export type DashboardWidgetRow = typeof dashboardWidgetsTable.$inferSelect;
export type DashboardWidgetInsertRow = typeof dashboardWidgetsTable.$inferInsert;

export const dashboardWidgetStateTable = sqliteTable(
  'dashboard_widget_state',
  {
    orgId: text('org_id').notNull(),
    widgetId: text('widget_id').notNull(),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull().default('null'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.widgetId, table.key] }),
  }),
);

export type DashboardWidgetStateRow = typeof dashboardWidgetStateTable.$inferSelect;
export type DashboardWidgetStateInsertRow = typeof dashboardWidgetStateTable.$inferInsert;
