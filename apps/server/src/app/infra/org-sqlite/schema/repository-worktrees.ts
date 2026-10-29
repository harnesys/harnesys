import { sql } from 'drizzle-orm';
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const repositoryWorktreesTable = sqliteTable(
  'repository_worktrees',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    sourceId: text('source_id').notNull(),
    hostId: text('host_id').notNull(),
    branch: text('branch').notNull(),
    baseCommit: text('base_commit'),
    state: text('state').notNull(),
    activeRunId: text('active_run_id'),
    operationId: text('operation_id').notNull(),
    issueId: text('issue_id'),
    lastErrorCode: text('last_error_code'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    operationUnique: uniqueIndex('repository_worktrees_org_operation_unique').on(
      table.orgId,
      table.operationId,
    ),
    activeBranchUnique: uniqueIndex('repository_worktrees_active_branch_unique')
      .on(table.orgId, table.sourceId, table.hostId, table.branch)
      .where(sql`state IN ('creating', 'ready', 'removing')`),
  }),
);

export type RepositoryWorktreeRow = typeof repositoryWorktreesTable.$inferSelect;
export type RepositoryWorktreeInsert = typeof repositoryWorktreesTable.$inferInsert;
