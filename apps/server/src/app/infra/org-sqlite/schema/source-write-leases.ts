import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sourceWriteLeasesTable = sqliteTable('source_write_leases', {
  sourceId: text('source_id').primaryKey(),
  runId: text('run_id').notNull(),
  nodeId: text('node_id').notNull(),
  leaseEpoch: integer('lease_epoch').notNull().default(0),
  expiresAt: text('expires_at').notNull(),
});

export type SourceWriteLeaseRow = typeof sourceWriteLeasesTable.$inferSelect;
export type SourceWriteLeaseInsert = typeof sourceWriteLeasesTable.$inferInsert;
