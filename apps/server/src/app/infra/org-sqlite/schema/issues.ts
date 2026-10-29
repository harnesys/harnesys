import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { issueBoardsTable } from './issue-boards.ts';

export const issuesTable = sqliteTable(
  'issues',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    boardId: text('board_id')
      .notNull()
      .references((): AnySQLiteColumn => issueBoardsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    statusKey: text('status_key').notNull(),
    priority: integer('priority').notNull().default(3),
    type: text('type', { enum: ['task', 'bug', 'research', 'feature', 'improvement', 'review'] })
      .notNull()
      .default('task'),
    assigneeAgentId: text('assignee_agent_id').references((): AnySQLiteColumn => agentsTable.id, {
      onDelete: 'set null',
    }),
    labels: text('labels').notNull().default('[]'),
    parentIssueId: text('parent_issue_id'),
    dueDate: text('due_date'),
    closedAt: text('closed_at'),
    fireTrail: text('fire_trail').notNull().default('[]'),
    sourceId: text('source_id'),
    worktreeBaseBranch: text('worktree_base_branch'),
    branch: text('branch'),
    worktreeOnStatus: text('worktree_on_status'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    typeCheck: check(
      'issues_type_check',
      sql`${table.type} IN ('task', 'bug', 'research', 'feature', 'improvement', 'review')`,
    ),
    priorityCheck: check('issues_priority_check', sql`${table.priority} BETWEEN 1 AND 4`),
    orgIdx: index('issues_org_idx').on(table.orgId, table.statusKey),
    boardIdx: index('issues_board_idx').on(table.boardId, table.statusKey),
    assigneeIdx: index('issues_assignee_idx').on(table.assigneeAgentId),
    parentIdx: index('issues_parent_idx').on(table.parentIssueId),
  }),
);

export type IssueRow = typeof issuesTable.$inferSelect;
export type IssueInsertRow = typeof issuesTable.$inferInsert;
