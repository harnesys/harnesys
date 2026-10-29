import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const issueExecutionsTable = sqliteTable('issue_executions', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  issueId: text('issue_id').notNull(),
  runId: text('run_id'),
  agentId: text('agent_id').notNull(),
  worktreeId: text('worktree_id'),
  correlationId: text('correlation_id').notNull(),
  leaseEpoch: integer('lease_epoch').notNull().default(1),
  state: text('state').notNull(),
  requestedStatus: text('requested_status').notNull(),
  ruleId: text('rule_id'),
  profileId: text('profile_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type IssueExecutionRow = typeof issueExecutionsTable.$inferSelect;
export type IssueExecutionInsert = typeof issueExecutionsTable.$inferInsert;
