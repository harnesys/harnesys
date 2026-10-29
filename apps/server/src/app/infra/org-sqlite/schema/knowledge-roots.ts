import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const knowledgeRootsTable = sqliteTable(
  'knowledge_roots',
  {
    sourceId: text('source_id').notNull(),
    path: text('path').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => ({
    pk: primaryKey({
      name: 'knowledge_roots_pk',
      columns: [table.sourceId, table.path],
    }),
  }),
);
export type KnowledgeRootRow = typeof knowledgeRootsTable.$inferSelect;
export type KnowledgeRootInsert = typeof knowledgeRootsTable.$inferInsert;
