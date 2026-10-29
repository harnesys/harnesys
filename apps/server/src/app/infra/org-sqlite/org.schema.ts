import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const orgs = sqliteTable('orgs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash'),
    lastSeenAt: text('last_seen_at'),
    status: text('status').notNull().default('offline'),
    enrolledAt: text('enrolled_at').notNull(),
    diskFreeBytes: integer('disk_free_bytes'),
    diskTotalBytes: integer('disk_total_bytes'),
    dockerAvailable: integer('docker_available', { mode: 'boolean' }),
  },
  (table) => ({
    nameUnique: uniqueIndex('nodes_name_unique').on(table.name),
  }),
);

export const invites = sqliteTable(
  'invites',
  {
    id: text('id').primaryKey(),
    codeHash: text('code_hash').notNull(),
    nodeName: text('node_name').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    codeHashUnique: uniqueIndex('invites_code_hash_unique').on(table.codeHash),
  }),
);

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  distributionJson: text('distribution_json').notNull(),
  uiVisibility: text('ui_visibility').notNull().default('org'),
  managed: integer('managed', { mode: 'boolean' }).notNull().default(false),
  lspJson: text('lsp_json'),
  vcsJson: text('vcs_json'),
  availabilityJson: text('availability_json').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sourceMaterializations = sqliteTable(
  'source_materializations',
  {
    orgId: text('org_id').notNull(),
    sourceId: text('source_id').notNull(),
    hostId: text('host_id').notNull(),
    origin: text('origin').notNull(),
    localPath: text('local_path'),
    state: text('state').notNull(),
    lastError: text('last_error'),
    revision: integer('revision').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
    lastConflictPaths: text('last_conflict_paths').notNull().default('[]'),
    refreshRequired: integer('refresh_required').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.sourceId, table.hostId] }),
  }),
);

export const sourceMaterializationProjections = sqliteTable(
  'source_materialization_projections',
  {
    orgId: text('org_id').notNull(),
    sourceId: text('source_id').notNull(),
    hostId: text('host_id').notNull(),
    state: text('state').notNull(),
    revision: integer('revision').notNull(),
    lastConfirmedAt: text('last_confirmed_at').notNull(),
    lastErrorCode: text('last_error_code'),
    lastConflictPaths: text('last_conflict_paths').notNull().default('[]'),
    refreshRequired: integer('refresh_required').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.sourceId, table.hostId] }),
  }),
);
