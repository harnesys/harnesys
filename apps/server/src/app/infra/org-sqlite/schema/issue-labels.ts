import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const issueLabelsTable = sqliteTable(
  'issue_labels',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    title: text('title').notNull(),
    color: text('color').notNull().default('#6b7280'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgIdx: index('issue_labels_org_idx').on(table.orgId),
    titleIdx: index('issue_labels_title_idx').on(table.orgId, table.title),
  }),
);

export type IssueLabelRow = typeof issueLabelsTable.$inferSelect;
export type IssueLabelInsert = typeof issueLabelsTable.$inferInsert;
