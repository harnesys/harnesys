import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const addonsTable = sqliteTable('addons', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  version: text('version').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  icon: text('icon').notNull().default('puzzle'),
  tagsJson: text('tags_json').notNull().default('[]'),
  root: text('root').notNull(),
  entry: text('entry').notNull(),
  state: text('state').notNull(),
  enabledAt: text('enabled_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const addonConfigTable = sqliteTable('addon_config', {
  orgId: text('org_id').notNull(),
  addonId: text('addon_id').notNull(),
  valuesJson: text('values_json').notNull().default('{}'),
  updatedAt: text('updated_at').notNull(),
});

export type AddonRow = typeof addonsTable.$inferSelect;
export type AddonInsert = typeof addonsTable.$inferInsert;
export type AddonConfigRow = typeof addonConfigTable.$inferSelect;
