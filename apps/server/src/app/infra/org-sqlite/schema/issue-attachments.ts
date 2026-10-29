import { type AnySQLiteColumn, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { issuesTable } from './issues.ts';

export const issueAttachmentsTable = sqliteTable(
  'issue_attachments',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    issueId: text('issue_id')
      .notNull()
      .references((): AnySQLiteColumn => issuesTable.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['file', 'source'] }).notNull(),
    name: text('name').notNull(),
    mediaType: text('media_type').notNull().default('application/octet-stream'),
    kindMedia: text('kind_media', { enum: ['image', 'audio', 'video', 'file'] })
      .notNull()
      .default('file'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    path: text('path'),
    sourceId: text('source_id'),
    sourcePath: text('source_path'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    issueIdx: index('issue_attachments_issue_idx').on(table.issueId),
  }),
);

export type IssueAttachmentRow = typeof issueAttachmentsTable.$inferSelect;
export type IssueAttachmentInsert = typeof issueAttachmentsTable.$inferInsert;
