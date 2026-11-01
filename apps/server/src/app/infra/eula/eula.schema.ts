import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const eulaConsentsTable = sqliteTable('eula_consents', {
  id: text('id').primaryKey(),
  acceptedAt: text('accepted_at').notNull(),
});

export type EulaConsentRow = typeof eulaConsentsTable.$inferSelect;

export const CREATE_EULA_CONSENTS_SQL = `
CREATE TABLE IF NOT EXISTS eula_consents (
  id TEXT PRIMARY KEY NOT NULL,
  accepted_at TEXT NOT NULL
);
`;

export function ensureEulaSchema(exec: (sql: string) => void): void {
  exec(CREATE_EULA_CONSENTS_SQL);
}
