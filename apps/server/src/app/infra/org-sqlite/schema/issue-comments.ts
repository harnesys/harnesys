import { type AnySQLiteColumn, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';
import { issuesTable } from './issues.ts';

export const issueCommentsTable = sqliteTable(
  'issue_comments',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    issueId: text('issue_id')
      .notNull()
      .references((): AnySQLiteColumn => issuesTable.id, { onDelete: 'cascade' }),
    authorType: text('author_type', { enum: ['human', 'agent'] }).notNull(),
    authorAgentId: text('author_agent_id').references((): AnySQLiteColumn => agentsTable.id, {
      onDelete: 'set null',
    }),
    body: text('body').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    issueIdx: index('issue_comments_issue_idx').on(table.issueId, table.createdAt),
  }),
);

export type IssueCommentRow = typeof issueCommentsTable.$inferSelect;
export type IssueCommentInsert = typeof issueCommentsTable.$inferInsert;
