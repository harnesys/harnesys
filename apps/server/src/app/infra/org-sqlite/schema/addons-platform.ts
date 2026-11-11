import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orgAddonsTable = sqliteTable(
  'org_addons',
  {
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    version: text('version').notNull(),
    enabled: integer('enabled').notNull().default(0),
    grantsJson: text('grants_json').notNull().default('[]'),
    grantsDigest: text('grants_digest').notNull().default(''),
    configJson: text('config_json').notNull().default('{}'),
    health: text('health').notNull().default('stopped'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.addonId] }),
    healthCheck: check(
      'org_addons_health_check',
      sql`${table.health} IN ('stopped', 'running', 'failed', 'quarantined')`,
    ),
  }),
);

export const addonBindingsTable = sqliteTable(
  'addon_bindings',
  {
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    connectionId: text('connection_id').notNull(),
    accountId: text('account_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.orgId, table.addonId, table.connectionId, table.accountId],
    }),
    accountIdx: index('addon_bindings_account').on(table.orgId, table.accountId),
  }),
);

export const addonTriggerInstancesTable = sqliteTable(
  'addon_trigger_instances',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    triggerId: text('trigger_id').notNull(),
    label: text('label').notNull(),
    configJson: text('config_json').notNull().default('{}'),
    targetJson: text('target_json').notNull().default('{}'),
    enabled: integer('enabled').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    addonIdx: index('addon_trigger_instances_addon').on(table.orgId, table.addonId),
  }),
);

export const addonTriggerFiresTable = sqliteTable(
  'addon_trigger_fires',
  {
    instanceId: text('instance_id').notNull(),
    runKey: text('run_key').notNull(),
    firedAt: integer('fired_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.instanceId, table.runKey] }),
  }),
);

export const addonJobStateTable = sqliteTable(
  'addon_job_state',
  {
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    jobId: text('job_id').notNull(),
    nextRunAt: integer('next_run_at'),
    lastRunAt: integer('last_run_at'),
    lastStatus: text('last_status'),
    enabled: integer('enabled').notNull().default(1),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.addonId, table.jobId] }),
  }),
);

export const addonTransportBindingsTable = sqliteTable(
  'addon_transport_bindings',
  {
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    provider: text('provider').notNull(),
    externalChatId: text('external_chat_id').notNull(),
    threadId: text('thread_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.orgId, table.addonId, table.provider, table.externalChatId],
    }),
  }),
);

export const addonTransportSessionsTable = sqliteTable(
  'addon_transport_sessions',
  {
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    provider: text('provider').notNull(),
    externalChatId: text('external_chat_id').notNull(),
    threadId: text('thread_id').notNull(),
    runId: text('run_id').notNull(),
    draft: text('draft').notNull().default(''),
    lastSeq: integer('last_seq').notNull().default(0),
    messageId: text('message_id'),
    status: text('status').notNull().default('streaming'),
    askId: text('ask_id'),
    askOptionsJson: text('ask_options_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.orgId, table.threadId, table.runId, table.addonId],
    }),
    openIdx: index('addon_transport_sessions_open').on(table.status, table.updatedAt),
    chatIdx: index('addon_transport_sessions_chat').on(
      table.orgId,
      table.addonId,
      table.externalChatId,
    ),
    statusCheck: check(
      'addon_transport_sessions_status_check',
      sql`${table.status} IN ('streaming', 'parked', 'closed')`,
    ),
  }),
);

export const addonTransportOutboundTable = sqliteTable(
  'addon_transport_outbound',
  {
    orgId: text('org_id').notNull(),
    addonId: text('addon_id').notNull(),
    messageId: text('message_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.addonId, table.messageId] }),
  }),
);

export type OrgAddonRowRecord = typeof orgAddonsTable.$inferSelect;
export type OrgAddonInsert = typeof orgAddonsTable.$inferInsert;
export type AddonBindingInsert = typeof addonBindingsTable.$inferInsert;
export type AddonTriggerInstanceInsert = typeof addonTriggerInstancesTable.$inferInsert;
export type AddonTriggerFireInsert = typeof addonTriggerFiresTable.$inferInsert;
export type AddonJobStateInsert = typeof addonJobStateTable.$inferInsert;
export type AddonTransportBindingInsert = typeof addonTransportBindingsTable.$inferSelect;
