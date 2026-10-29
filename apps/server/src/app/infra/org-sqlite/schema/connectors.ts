import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { agentsTable } from './agents.ts';

export const connectorsTable = sqliteTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references((): AnySQLiteColumn => agentsTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    secretRef: text('secret_ref').notNull(),
    status: text('status').notNull().default('awaiting_pair'),
    botUserId: text('bot_user_id').notNull().default(''),
    botUsername: text('bot_username').notNull().default(''),
    pairCodeHash: text('pair_code_hash'),
    pairCodeExpiresAt: text('pair_code_expires_at'),
    leaseOwner: text('lease_owner'),
    leaseUntil: text('lease_until'),
    streamMode: text('stream_mode'),
    policy: text('policy').notNull(),
    modeOverride: text('mode_override'),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'connectors_status_check',
      sql`${table.status} IN ('awaiting_pair', 'active', 'paused', 'error')`,
    ),
    streamModeCheck: check(
      'connectors_stream_mode_check',
      sql`${table.streamMode} IS NULL OR ${table.streamMode} IN ('draft', 'edit')`,
    ),
    orgIdx: index('connectors_org_idx').on(table.orgId),
    agentProviderIdx: index('connectors_agent_provider_idx').on(table.agentId, table.provider),
    botUserUnique: uniqueIndex('connectors_org_provider_bot_user_unique')
      .on(table.orgId, table.provider, table.botUserId)
      .where(sql`${table.botUserId} != ''`),
  }),
);

export const connectorBindingsTable = sqliteTable(
  'connector_bindings',
  {
    id: text('id').primaryKey(),
    connectorId: text('connector_id')
      .notNull()
      .references((): AnySQLiteColumn => connectorsTable.id, { onDelete: 'cascade' }),
    orgId: text('org_id').notNull(),
    externalChatId: text('external_chat_id').notNull().default(''),
    externalTopicId: text('external_topic_id').notNull().default(''),
    chatType: text('chat_type').notNull().default('private'),
    threadId: text('thread_id').notNull(),
    participantPolicy: text('participant_policy').notNull().default('{}'),
    status: text('status').notNull().default('active'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'connector_bindings_status_check',
      sql`${table.status} IN ('active', 'unpaired')`,
    ),
    chatTypeCheck: check(
      'connector_bindings_chat_type_check',
      sql`${table.chatType} IN ('private')`,
    ),
    chatUnique: uniqueIndex('connector_bindings_chat_unique').on(
      table.connectorId,
      table.externalChatId,
      table.externalTopicId,
    ),
    connectorIdx: index('connector_bindings_connector_idx').on(table.connectorId),
  }),
);

export const connectorRoutesTable = sqliteTable(
  'connector_routes',
  {
    id: text('id').primaryKey(),
    connectorId: text('connector_id')
      .notNull()
      .references((): AnySQLiteColumn => connectorsTable.id, { onDelete: 'cascade' }),
    bindingId: text('binding_id').notNull(),
    scope: text('scope').notNull().default('thread'),
    threadId: text('thread_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    scopeCheck: check('connector_routes_scope_check', sql`${table.scope} IN ('thread', 'agent')`),
    routeUnique: uniqueIndex('connector_routes_unique').on(
      table.connectorId,
      table.scope,
      table.threadId,
    ),
    connectorIdx: index('connector_routes_connector_idx').on(table.connectorId),
  }),
);

export const connectorInboxTable = sqliteTable(
  'connector_inbox',
  {
    id: text('id').primaryKey(),
    connectorId: text('connector_id')
      .notNull()
      .references((): AnySQLiteColumn => connectorsTable.id, { onDelete: 'cascade' }),
    bindingId: text('binding_id'),
    updateId: integer('update_id').notNull(),
    kind: text('kind').notNull(),
    payload: text('payload').notNull().default('{}'),
    status: text('status').notNull().default('pending'),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    kindCheck: check(
      'connector_inbox_kind_check',
      sql`${table.kind} IN ('message', 'callback', 'command', 'edit', 'generation_stopped', 'unsupported')`,
    ),
    statusCheck: check(
      'connector_inbox_status_check',
      sql`${table.status} IN ('pending', 'consumed', 'rejected')`,
    ),
    updateUnique: uniqueIndex('connector_inbox_update_unique').on(
      table.connectorId,
      table.updateId,
    ),
    pendingIdx: index('connector_inbox_pending_idx').on(table.connectorId, table.status),
  }),
);

export const connectorDeliveriesTable = sqliteTable(
  'connector_deliveries',
  {
    id: text('id').primaryKey(),
    connectorId: text('connector_id')
      .notNull()
      .references((): AnySQLiteColumn => connectorsTable.id, { onDelete: 'cascade' }),
    bindingId: text('binding_id').notNull(),
    threadId: text('thread_id').notNull(),
    runId: text('run_id').notNull(),
    blockKey: text('block_key').notNull(),
    interruptId: text('interrupt_id'),
    draftId: integer('draft_id'),
    lastText: text('last_text'),
    externalMessageId: text('external_message_id'),
    status: text('status').notNull().default('streaming'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    statusCheck: check(
      'connector_deliveries_status_check',
      sql`${table.status} IN ('streaming', 'final', 'failed')`,
    ),
    blockUnique: uniqueIndex('connector_deliveries_block_unique').on(
      table.connectorId,
      table.runId,
      table.blockKey,
    ),
    streamingIdx: index('connector_deliveries_streaming_idx').on(table.connectorId, table.status),
  }),
);

export type ConnectorRow = typeof connectorsTable.$inferSelect;
export type ConnectorInsertRow = typeof connectorsTable.$inferInsert;
export type ConnectorBindingRow = typeof connectorBindingsTable.$inferSelect;
export type ConnectorBindingInsertRow = typeof connectorBindingsTable.$inferInsert;
export type ConnectorRouteRow = typeof connectorRoutesTable.$inferSelect;
export type ConnectorRouteInsertRow = typeof connectorRoutesTable.$inferInsert;
export type ConnectorInboxRow = typeof connectorInboxTable.$inferSelect;
export type ConnectorInboxInsertRow = typeof connectorInboxTable.$inferInsert;
export type ConnectorDeliveryRow = typeof connectorDeliveriesTable.$inferSelect;
export type ConnectorDeliveryInsertRow = typeof connectorDeliveriesTable.$inferInsert;
