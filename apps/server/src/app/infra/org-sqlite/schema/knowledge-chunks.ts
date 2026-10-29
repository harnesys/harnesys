import { blob, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const knowledgeChunksTable = sqliteTable(
  'knowledge_chunks',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    uri: text('uri').notNull(),
    title: text('title'),
    text: text('text').notNull(),
    embedding: blob('embedding', { mode: 'buffer' }),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    sourceIdx: index('knowledge_chunks_source_idx').on(table.sourceId),
    sourceUriIdx: index('knowledge_chunks_source_uri_idx').on(table.sourceId, table.uri),
  }),
);
export type KnowledgeChunkRow = typeof knowledgeChunksTable.$inferSelect;
export type KnowledgeChunkInsert = typeof knowledgeChunksTable.$inferInsert;
