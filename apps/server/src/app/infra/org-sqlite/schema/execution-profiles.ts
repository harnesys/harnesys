import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const executionProfilesTable = sqliteTable(
  'execution_profiles',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    system: integer('system', { mode: 'boolean' }).notNull().default(false),
    normalizedName: text('normalized_name').notNull(),
    isolation: text('isolation', { enum: ['host', 'container'] })
      .notNull()
      .default('host'),
    dockerImage: text('docker_image'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgNormalizedNameUnique: uniqueIndex('execution_profiles_org_id_normalized_name_unique').on(
      table.orgId,
      table.normalizedName,
    ),
  }),
);

export const executionProfileNodesTable = sqliteTable(
  'execution_profile_nodes',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => executionProfilesTable.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    orgId: text('org_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    profileNodeUnique: uniqueIndex('execution_profile_nodes_profile_node_unique').on(
      table.profileId,
      table.nodeId,
    ),
  }),
);

export const orgExecutionSettingsTable = sqliteTable('org_execution_settings', {
  orgId: text('org_id').primaryKey(),
  defaultProfileId: text('default_profile_id'),
  updatedAt: text('updated_at').notNull(),
});

export type ExecutionProfileRow = typeof executionProfilesTable.$inferSelect;
export type ExecutionProfileInsert = typeof executionProfilesTable.$inferInsert;
export type ExecutionProfileNodeRow = typeof executionProfileNodesTable.$inferSelect;
export type ExecutionProfileNodeInsert = typeof executionProfileNodesTable.$inferInsert;
export type OrgExecutionSettingsRow = typeof orgExecutionSettingsTable.$inferSelect;
export type OrgExecutionSettingsInsert = typeof orgExecutionSettingsTable.$inferInsert;
