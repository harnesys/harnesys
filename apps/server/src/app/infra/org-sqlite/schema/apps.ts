import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const appsTable = sqliteTable(
  'apps',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('configured'),
    lastError: text('last_error'),
    valuesJson: text('values_json').notNull().default('{}'),
    secretFieldsJson: text('secret_fields_json').notNull().default('[]'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    verifiedAt: integer('verified_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check('apps_status_check', sql`${table.status} IN ('configured', 'invalid')`),
    orgKindIdx: index('apps_org_kind').on(table.orgId, table.kind),
  }),
);

export const appAccountsTable = sqliteTable(
  'app_accounts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    appId: text('app_id').references(() => appsTable.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    partition: text('partition').notNull().default(''),
    label: text('label').notNull(),
    status: text('status').notNull().default('connected'),
    lastError: text('last_error'),
    scopesJson: text('scopes_json').notNull().default('[]'),
    expiresAt: integer('expires_at'),
    configJson: text('config_json').notNull().default('{}'),
    secretFieldsJson: text('secret_fields_json').notNull().default('[]'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    verifiedAt: integer('verified_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'app_accounts_status_check',
      sql`${table.status} IN ('connected', 'expired', 'error')`,
    ),
    orgKindIdx: index('app_accounts_org_kind').on(table.orgId, table.kind),
    orgAppIdx: index('app_accounts_org_app').on(table.orgId, table.appId),
    identityUnique: uniqueIndex('app_accounts_identity_unique').on(
      table.orgId,
      table.kind,
      table.externalAccountId,
      table.partition,
    ),
  }),
);

export type AppRow = typeof appsTable.$inferSelect;
export type AppInsertRow = typeof appsTable.$inferInsert;
export type AppAccountRow = typeof appAccountsTable.$inferSelect;
export type AppAccountInsertRow = typeof appAccountsTable.$inferInsert;
