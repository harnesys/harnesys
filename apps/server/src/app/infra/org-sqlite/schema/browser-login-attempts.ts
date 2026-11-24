import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const browserLoginAttemptsTable = sqliteTable('browser_login_attempts', {
  id: text('id').primaryKey(),
  credentialId: text('credential_id').notNull(),
  runId: text('run_id'),
  threadId: text('thread_id'),
  status: text('status').notNull().default('waiting'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export type BrowserLoginAttemptRow = typeof browserLoginAttemptsTable.$inferSelect;
export type BrowserLoginAttemptInsert = typeof browserLoginAttemptsTable.$inferInsert;
