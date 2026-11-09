import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const appsTable = sqliteTable(
  'apps',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('configured'),
    configJson: text('config_json').notNull().default('{}'),
    secretFieldsJson: text('secret_fields_json').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check('apps_status_check', sql`${table.status} IN ('configured', 'invalid')`),
    orgIdx: index('apps_org_idx').on(table.orgId),
    kindIdx: index('apps_org_kind_idx').on(table.orgId, table.kind),
  }),
);

export const appAccountsTable = sqliteTable(
  'app_accounts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    appId: text('app_id').references(() => appsTable.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    label: text('label').notNull(),
    status: text('status').notNull().default('pending'),
    scopesJson: text('scopes_json').notNull().default('[]'),
    scopeKey: text('scope_key').notNull(),
    valuesJson: text('values_json').notNull().default('{}'),
    secretFieldsJson: text('secret_fields_json').notNull().default('[]'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'app_accounts_status_check',
      sql`${table.status} IN ('connected', 'expired', 'error', 'pending')`,
    ),
    orgIdx: index('app_accounts_org_idx').on(table.orgId),
    appIdx: index('app_accounts_app_idx').on(table.appId),
    identityUnique: uniqueIndex('app_accounts_identity_unique').on(
      table.orgId,
      table.kind,
      table.externalAccountId,
      table.scopeKey,
    ),
  }),
);

export type AppRow = typeof appsTable.$inferSelect;
export type AppInsertRow = typeof appsTable.$inferInsert;
export type AppAccountRow = typeof appAccountsTable.$inferSelect;
export type AppAccountInsertRow = typeof appAccountsTable.$inferInsert;
