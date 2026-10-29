import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { issuesTable } from './issues.ts';

export const issueDependenciesTable = sqliteTable(
  'issue_dependencies',
  {
    orgId: text('org_id').notNull(),
    issueId: text('issue_id')
      .notNull()
      .references((): AnySQLiteColumn => issuesTable.id, { onDelete: 'cascade' }),
    dependsOnIssueId: text('depends_on_issue_id')
      .notNull()
      .references((): AnySQLiteColumn => issuesTable.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['blocks', 'relates', 'duplicate'] })
      .notNull()
      .default('blocks'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.issueId, table.dependsOnIssueId] }),
    selfCheck: check(
      'issue_dependencies_self_check',
      sql`${table.issueId} <> ${table.dependsOnIssueId}`,
    ),
    typeCheck: check(
      'issue_dependencies_type_check',
      sql`${table.type} IN ('blocks', 'relates', 'duplicate')`,
    ),
    issueIdx: index('issue_dependencies_issue_idx').on(table.issueId),
    dependsOnIdx: index('issue_dependencies_depends_on_idx').on(table.dependsOnIssueId),
  }),
);

export type IssueDependencyRow = typeof issueDependenciesTable.$inferSelect;
export type IssueDependencyInsert = typeof issueDependenciesTable.$inferInsert;
