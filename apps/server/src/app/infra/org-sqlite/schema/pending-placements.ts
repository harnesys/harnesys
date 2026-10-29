import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pendingPlacementsTable = sqliteTable('pending_placements', {
  runId: text('run_id').primaryKey(),
  threadId: text('thread_id').notNull(),
  profileId: text('profile_id').notNull(),
  configRevision: integer('config_revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  lastReason: text('last_reason').notNull(),
  attempt: integer('attempt').notNull().default(0),
  priority: integer('priority').notNull().default(3),
  triggerKind: text('trigger_kind').notNull(),
  triggerId: text('trigger_id').notNull(),
  expiresAt: text('expires_at'),
  payloadJson: text('payload_json').notNull(),
  lastCandidatesJson: text('last_candidates_json').notNull().default('[]'),
});

export type PendingPlacementRow = typeof pendingPlacementsTable.$inferSelect;
export type PendingPlacementInsert = typeof pendingPlacementsTable.$inferInsert;
