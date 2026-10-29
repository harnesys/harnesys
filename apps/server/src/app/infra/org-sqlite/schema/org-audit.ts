import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const orgAuditTable = sqliteTable(
  'org_audit',
  {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    viaNodeId: text('via_node_id'),
    action: text('action').notNull(),
    resource: text('resource').notNull(),
    result: text('result').notNull(),
  },
  (table) => ({
    atIndex: index('org_audit_at_idx').on(table.at),
  }),
);

export type OrgAuditRowTable = typeof orgAuditTable.$inferSelect;
export type OrgAuditInsert = typeof orgAuditTable.$inferInsert;
