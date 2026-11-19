import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const modelQuotaWindowsTable = sqliteTable(
  'model_quota_windows',
  {
    modelKey: text('model_key').notNull(),
    bucket: text('bucket').notNull(),
    windowStart: integer('window_start').notNull(),
    requests: integer('requests').notNull().default(0),
    tokens: integer('tokens').notNull().default(0),
    reservedRequests: integer('reserved_requests').notNull().default(0),
    reservedTokens: integer('reserved_tokens').notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.modelKey, table.bucket] }),
  }),
);

export type ModelQuotaWindowRow = typeof modelQuotaWindowsTable.$inferSelect;
export type ModelQuotaWindowInsert = typeof modelQuotaWindowsTable.$inferInsert;
