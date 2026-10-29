import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const pluginRegistriesTable = sqliteTable(
  'plugin_registries',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    source: text('source').notNull(),
    path: text('path').notNull(),
    revision: text('revision'),
    lastSyncAt: text('last_sync_at'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nameUnique: uniqueIndex('plugin_registries_name_unique').on(table.name),
  }),
);

export const pluginCatalogEntriesTable = sqliteTable(
  'plugin_catalog_entries',
  {
    id: text('id').primaryKey(),
    registryId: text('registry_id')
      .notNull()
      .references(() => pluginRegistriesTable.id, { onDelete: 'cascade' }),
    pluginName: text('plugin_name').notNull(),
    payload: text('payload').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    registryPluginUnique: uniqueIndex('plugin_catalog_entries_registry_plugin_unique').on(
      table.registryId,
      table.pluginName,
    ),
  }),
);

export type PluginRegistryRow = typeof pluginRegistriesTable.$inferSelect;
export type PluginCatalogEntryRow = typeof pluginCatalogEntriesTable.$inferSelect;

export const CREATE_PLUGIN_REGISTRIES_SQL = `
CREATE TABLE IF NOT EXISTS plugin_registries (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  path TEXT NOT NULL,
  revision TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_registries_name_unique ON plugin_registries(name);
`;

export const CREATE_PLUGIN_CATALOG_ENTRIES_SQL = `
CREATE TABLE IF NOT EXISTS plugin_catalog_entries (
  id TEXT PRIMARY KEY NOT NULL,
  registry_id TEXT NOT NULL REFERENCES plugin_registries(id) ON DELETE CASCADE,
  plugin_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_catalog_entries_registry_plugin_unique
  ON plugin_catalog_entries(registry_id, plugin_name);
`;

export function ensurePluginMarketplacesSchema(exec: (sql: string) => void): void {
  exec('PRAGMA foreign_keys = ON;');
  exec(CREATE_PLUGIN_REGISTRIES_SQL);
  exec(CREATE_PLUGIN_CATALOG_ENTRIES_SQL);
}
