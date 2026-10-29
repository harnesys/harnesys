import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const secrets = sqliteTable('secrets', {
  key: text('key').primaryKey(),
  ciphertext: blob('ciphertext', { mode: 'buffer' }).notNull(),
  iv: blob('iv', { mode: 'buffer' }).notNull(),
  tag: blob('tag', { mode: 'buffer' }).notNull(),
  keyVersion: integer('key_version').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
