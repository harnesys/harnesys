import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const integrationsTable = sqliteTable(
  'integrations',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    accountLabel: text('account_label').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    credRef: text('cred_ref').notNull(),
    providerJson: text('provider_json'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastRefreshAt: text('last_refresh_at'),
  },
  (table) => ({
    externalAccountUnique: uniqueIndex('integrations_org_provider_external_unique').on(
      table.orgId,
      table.provider,
      table.externalAccountId,
    ),
  }),
);

export type IntegrationRow = typeof integrationsTable.$inferSelect;
export type IntegrationInsertRow = typeof integrationsTable.$inferInsert;
