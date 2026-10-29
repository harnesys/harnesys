import { primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pluginsTable = sqliteTable(
  'plugins',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    source: text('source').notNull(),
    revision: text('revision').notNull(),
    path: text('path').notNull(),
    dataPath: text('data_path').notNull(),
    format: text('format'),
    grants: text('grants').notNull().default('{}'),
    options: text('options').notNull().default('{}'),
    registryId: text('registry_id'),
    catalogPluginName: text('catalog_plugin_name'),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgNameUnique: uniqueIndex('plugins_org_id_name_unique').on(table.orgId, table.name),
  }),
);

export const pluginApprovalsTable = sqliteTable(
  'plugin_approvals',
  {
    orgId: text('org_id').notNull(),
    pluginName: text('plugin_name').notNull(),
    serverId: text('server_id').notNull(),
    approvedAt: text('approved_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.pluginName, table.serverId] }),
  }),
);

export const pluginServerStateTable = sqliteTable(
  'plugin_server_state',
  {
    pluginName: text('plugin_name').notNull(),
    serverId: text('server_id').notNull(),
    orgId: text('org_id').notNull(),
    disabledAt: text('disabled_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pluginName, table.serverId, table.orgId] }),
  }),
);

export type PluginRow = typeof pluginsTable.$inferSelect;
export type PluginInsert = typeof pluginsTable.$inferInsert;
export type PluginApprovalRow = typeof pluginApprovalsTable.$inferSelect;
export type PluginServerStateRow = typeof pluginServerStateTable.$inferSelect;
