import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const signalsTable = sqliteTable('signals', {
  key: text('key').primaryKey(),
  firedAt: text('fired_at').notNull(),
});

export type SignalRow = typeof signalsTable.$inferSelect;
