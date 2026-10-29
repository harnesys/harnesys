import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const modePresetsTable = sqliteTable(
  'mode_presets',
  {
    orgId: text('org_id').notNull(),
    id: text('id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    instructions: text('instructions').notNull().default(''),
    skillsJson: text('skills_json').notNull().default('[]'),
    packsJson: text('packs_json').notNull().default('{}'),
    disabledToolsJson: text('disabled_tools_json').notNull().default('[]'),
    exposureJson: text('exposure_json').notNull().default('{}'),
    permissionsJson: text('permissions_json').notNull().default('{}'),
    builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
    installedByDefault: integer('installed_by_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.id] }),
    nameUnique: uniqueIndex('mode_presets_org_id_name_unique').on(table.orgId, table.name),
  }),
);

export type ModePresetRow = typeof modePresetsTable.$inferSelect;
export type ModePresetInsert = typeof modePresetsTable.$inferInsert;
