import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const knowledgeSettingsTable = sqliteTable(
  'knowledge_settings',
  {
    sourceId: text('source_id').primaryKey(),
    entireSource: integer('entire_source', { mode: 'boolean' }).notNull().default(false),
    backend: text('backend', { enum: ['fts', 'vector'] })
      .notNull()
      .default('fts'),
    embedProvider: text('embed_provider'),
    embedModel: text('embed_model'),
    watchEnabled: integer('watch_enabled', { mode: 'boolean' }).notNull().default(false),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    backendCheck: check(
      'knowledge_settings_backend_check',
      sql`${table.backend} IN ('fts', 'vector')`,
    ),
  }),
);
export type KnowledgeSettingsRow = typeof knowledgeSettingsTable.$inferSelect;
export type KnowledgeSettingsInsert = typeof knowledgeSettingsTable.$inferInsert;
