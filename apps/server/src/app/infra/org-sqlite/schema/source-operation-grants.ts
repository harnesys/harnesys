import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sourceOperationGrantsTable = sqliteTable('source_operation_grants', {
  operationId: text('operation_id').primaryKey(),
  orgId: text('org_id').notNull(),
  nodeId: text('node_id').notNull(),
  sourceId: text('source_id').notNull(),
  credRef: text('cred_ref').notNull(),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
});

export type SourceOperationGrantRow = typeof sourceOperationGrantsTable.$inferSelect;
export type SourceOperationGrantInsert = typeof sourceOperationGrantsTable.$inferInsert;
