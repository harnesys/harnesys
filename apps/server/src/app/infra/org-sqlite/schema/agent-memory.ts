import {
  blob,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const memoryPinsTable = sqliteTable(
  'memory_pins',
  {
    orgId: text('org_id').notNull(),
    agentName: text('agent_name').notNull(),
    key: text('key').notNull(),
    text: text('text').notNull(),
    source: text('source').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    orgAgentKeyIdx: uniqueIndex('memory_pins_org_agent_key_idx').on(
      table.orgId,
      table.agentName,
      table.key,
    ),
  }),
);

export type MemoryPinRow = typeof memoryPinsTable.$inferSelect;
export type MemoryPinInsert = typeof memoryPinsTable.$inferInsert;

export const memoryFactsTable = sqliteTable(
  'memory_facts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentName: text('agent_name').notNull(),
    scope: text('scope').notNull(),
    text: text('text').notNull(),
    key: text('key'),
    threadId: text('thread_id'),
    source: text('source').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    importance: integer('importance').notNull().default(5),
    lastAccessedAt: text('last_accessed_at'),
    accessCount: integer('access_count').notNull().default(0),
    supersededBy: text('superseded_by'),
    embedding: blob('embedding', { mode: 'buffer' }),
    embeddingModel: text('embedding_model'),
  },
  (table) => ({
    lookupIdx: index('memory_facts_lookup_idx').on(
      table.orgId,
      table.agentName,
      table.scope,
      table.key,
    ),
  }),
);

export type MemoryFactRow = typeof memoryFactsTable.$inferSelect;
export type MemoryFactInsert = typeof memoryFactsTable.$inferInsert;

export const memoryConsolidationsTable = sqliteTable(
  'memory_consolidations',
  {
    orgId: text('org_id').notNull(),
    agentName: text('agent_name').notNull(),
    threadId: text('thread_id').notNull(),
    lastRunId: text('last_run_id').notNull().default(''),
    lastSeq: integer('last_seq').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.agentName, table.threadId] }),
  }),
);

export type MemoryConsolidationRow = typeof memoryConsolidationsTable.$inferSelect;
export type MemoryConsolidationInsert = typeof memoryConsolidationsTable.$inferInsert;

export const memoryReflectsTable = sqliteTable(
  'memory_reflects',
  {
    orgId: text('org_id').notNull(),
    agentName: text('agent_name').notNull(),
    lastReflectedAt: text('last_reflected_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.agentName] }),
  }),
);

export type MemoryReflectRow = typeof memoryReflectsTable.$inferSelect;
export type MemoryReflectInsert = typeof memoryReflectsTable.$inferInsert;

export const memoryPromotionsTable = sqliteTable(
  'memory_promotions',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    agentName: text('agent_name').notNull(),
    factId: text('fact_id').notNull(),
    status: text('status').notNull(),
    instructionBlock: text('instruction_block'),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (table) => ({
    orgAgentFactIdx: uniqueIndex('memory_promotions_org_agent_fact_idx').on(
      table.orgId,
      table.agentName,
      table.factId,
    ),
  }),
);

export type MemoryPromotionRow = typeof memoryPromotionsTable.$inferSelect;
export type MemoryPromotionInsert = typeof memoryPromotionsTable.$inferInsert;

export const orgMemorySettingsTable = sqliteTable('org_memory_settings', {
  orgId: text('org_id').primaryKey(),
  embedModelId: text('embed_model_id'),
  decisionModelId: text('decision_model_id'),
  lastCrawlAt: text('last_crawl_at'),
  lastCrawlSummary: text('last_crawl_summary'),
  updatedAt: text('updated_at').notNull(),
});

export type OrgMemorySettingsRow = typeof orgMemorySettingsTable.$inferSelect;
export type OrgMemorySettingsInsert = typeof orgMemorySettingsTable.$inferInsert;
