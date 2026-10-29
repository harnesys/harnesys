import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const integrationEventsTable = sqliteTable(
  'integration_events',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    integrationId: text('integration_id').notNull(),
    deliveryId: text('delivery_id').notNull(),
    eventType: text('event_type').notNull(),
    payloadJson: text('payload_json').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    deliveryUnique: uniqueIndex('integration_events_delivery_unique').on(table.deliveryId),
  }),
);

export type IntegrationEventRow = typeof integrationEventsTable.$inferSelect;
export type IntegrationEventInsertRow = typeof integrationEventsTable.$inferInsert;
