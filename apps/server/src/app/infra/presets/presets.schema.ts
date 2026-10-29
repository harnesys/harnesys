import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const presetsTable = sqliteTable('presets', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  origin: text('origin').notNull(),
  version: text('version').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  body: text('body').notNull(),
  author: text('author'),
  installedFrom: text('installed_from'),
  tags: text('tags').notNull().default('[]'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type PresetRow = typeof presetsTable.$inferSelect;

export const CREATE_PRESETS_SQL = `
CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  origin TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  body TEXT NOT NULL,
  author TEXT,
  installed_from TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function ensurePresetsSchema(exec: (sql: string) => void): void {
  exec(CREATE_PRESETS_SQL);
}
