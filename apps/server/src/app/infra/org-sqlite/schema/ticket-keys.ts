import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orgTicketKeysTable = sqliteTable('org_ticket_keys', {
  orgId: text('org_id').primaryKey(),
  key: text('key').notNull(),
  createdAt: text('created_at').notNull(),
  rotatedAt: text('rotated_at'),
});

export type OrgTicketKeyRow = typeof orgTicketKeysTable.$inferSelect;
export type OrgTicketKeyInsert = typeof orgTicketKeysTable.$inferInsert;
