import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const usageTable = sqliteTable('usage', {
  id: text('id').primaryKey(),
  ts: text('ts').notNull(),
  projectId: text('project_id'),
  agentId: text('agent_id'),
  runId: text('run_id').notNull(),
  model: text('model').notNull(),
  modelId: text('model_id'),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  cacheReadTokens: integer('cache_read_tokens'),
  cacheWriteTokens: integer('cache_write_tokens'),
  reasoningTokens: integer('reasoning_tokens'),
  images: integer('images'),
  costUsd: real('cost_usd').notNull().default(0),
  pricingSource: text('pricing_source').notNull().default('none'),
});

export const budgetMarksTable = sqliteTable('budget_marks', {
  entityId: text('entity_id').notNull(),
  scope: text('scope').notNull(),
  percent: integer('percent').notNull(),
  markedAt: text('marked_at').notNull(),
});

export const priceOverridesTable = sqliteTable('price_overrides', {
  modelId: text('model_id').primaryKey(),
  inputPer1M: real('input_per_1m').notNull(),
  outputPer1M: real('output_per_1m').notNull(),
});
