import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const eventClaimsTable = sqliteTable('event_claims', {
  runId: text('run_id').primaryKey(),
  nodeId: text('node_id').notNull(),
  leaseEpoch: integer('lease_epoch').notNull().default(0),
  leaseUntil: text('lease_until').notNull(),
  token: text('token').notNull(),
  doneAt: text('done_at'),
});

export type EventClaimRow = typeof eventClaimsTable.$inferSelect;
export type EventClaimInsert = typeof eventClaimsTable.$inferInsert;
