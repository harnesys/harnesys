import { Database } from 'bun:sqlite';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import type { PendingSessionEvent } from 'harnesys';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { agentsTable } from '../org-sqlite/schema/agents.ts';
import * as schema from '../org-sqlite/schema/index.ts';
import { llmModelsTable } from '../org-sqlite/schema/llm-models.ts';
import { llmProvidersTable } from '../org-sqlite/schema/llm-providers.ts';
import { threadsTable } from '../org-sqlite/schema/threads.ts';
import { priceOverridesTable, usageTable } from '../org-sqlite/schema/usage.ts';
import { prepareUsageEvents } from './prepare-usage-events.ts';

const NOW = new Date().toISOString();
const ORG_ID = 'org-1';

function createDb() {
  const sqlite = new Database(':memory:');
  ensureOrgSchema(
    (sql) => {
      sqlite.exec(sql);
    },
    (sql) => sqlite.query(sql).all() as { name: string }[],
  );
  return drizzle(sqlite, { schema });
}

function seedCatalog(db: ReturnType<typeof createDb>): { modelId: string; modelName: string } {
  db.insert(llmProvidersTable)
    .values({
      id: 'provider-1',
      orgId: ORG_ID,
      name: 'openrouter',
      driver: 'openai-compatible',
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  const modelId = 'model-1';
  db.insert(llmModelsTable)
    .values({
      id: modelId,
      providerId: 'provider-1',
      name: 'openai/gpt-4o',
      kind: 'chat',
      metadata: JSON.stringify({ pricing: { prompt: '0.0000025', completion: '0.00001' } }),
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  return { modelId, modelName: 'openai/gpt-4o' };
}

function seedThread(db: ReturnType<typeof createDb>, agentId: string): string {
  db.insert(agentsTable)
    .values({
      id: agentId,
      orgId: ORG_ID,
      name: 'coder',
      role: 'coder',
      instructions: '',
      model: 'openai/gpt-4o',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
  const threadId = 'thread-1';
  db.insert(threadsTable)
    .values({
      id: threadId,
      orgId: ORG_ID,
      agentId,
      originAgentId: agentId,
      title: 'thread',
      createdAt: NOW,
      updatedAt: NOW,
      lastReadAt: NOW,
    })
    .run();
  return threadId;
}

function usageEvent(
  modelId: string,
  modelName: string,
  agentId?: string,
  images?: number,
): PendingSessionEvent {
  return {
    type: 'model.usage',
    usage: {
      model: modelName,
      modelId,
      promptTokens: 1000,
      generatedTokens: 500,
      ...(images === undefined ? {} : { images }),
    },
    ...(agentId ? { agentId } : {}),
  };
}

describe('prepareUsageEvents', () => {
  test('catalog price is written to the usage row and to the event', () => {
    const db = createDb();
    const { modelId, modelName } = seedCatalog(db);
    const threadId = seedThread(db, 'agent-1');

    const prepared = prepareUsageEvents(db, 'run-1', threadId, [usageEvent(modelId, modelName)]);

    const event = prepared[0];
    expect(event?.type).toBe('model.usage');
    expect(event?.type === 'model.usage' ? event.costUsd : null).toBeCloseTo(0.0075, 10);
    expect(event?.type === 'model.usage' ? event.pricingSource : null).toBe('catalog');

    const row = db.select().from(usageTable).all()[0];
    expect(row?.costUsd).toBeCloseTo(0.0075, 10);
    expect(row?.pricingSource).toBe('catalog');
    expect(row?.modelId).toBe(modelId);
    expect(row?.model).toBe(modelName);
    expect(row?.runId).toBe('run-1');
    expect(row?.agentId).toBe('agent-1');
  });

  test('executing agent wins over the thread agent', () => {
    const db = createDb();
    const { modelId, modelName } = seedCatalog(db);
    const threadId = seedThread(db, 'agent-1');

    prepareUsageEvents(db, 'run-1', threadId, [usageEvent(modelId, modelName, 'agent-2')]);

    const row = db.select().from(usageTable).all()[0];
    expect(row?.agentId).toBe('agent-2');
  });

  test('manual override wins over the catalog', () => {
    const db = createDb();
    const { modelId, modelName } = seedCatalog(db);
    const threadId = seedThread(db, 'agent-1');
    db.insert(priceOverridesTable).values({ modelId, inputPer1M: 3, outputPer1M: 15 }).run();

    prepareUsageEvents(db, 'run-1', threadId, [usageEvent(modelId, modelName)]);

    const row = db.select().from(usageTable).all()[0];
    expect(row?.pricingSource).toBe('manual');
    expect(row?.costUsd).toBeCloseTo(0.0105, 10);
  });

  test('model without a price stays unpriced', () => {
    const db = createDb();
    const threadId = seedThread(db, 'agent-1');

    const prepared = prepareUsageEvents(db, 'run-1', threadId, [
      usageEvent('unknown', 'unknown-model'),
    ]);

    const row = db.select().from(usageTable).all()[0];
    expect(row?.costUsd).toBe(0);
    expect(row?.pricingSource).toBe('none');
    expect(prepared[0]?.type === 'model.usage' ? (prepared[0]?.pricingSource ?? null) : null).toBe(
      'none',
    );
  });

  test('image count is stored and priced per image', () => {
    const db = createDb();
    const { modelId, modelName } = seedCatalog(db);
    const threadId = seedThread(db, 'agent-1');
    db.update(llmModelsTable)
      .set({
        metadata: JSON.stringify({
          pricing: { prompt: '0.0000025', completion: '0.00001', image: '0.003' },
        }),
      })
      .where(eq(llmModelsTable.id, modelId))
      .run();

    prepareUsageEvents(db, 'run-1', threadId, [usageEvent(modelId, modelName, undefined, 2)]);

    const row = db.select().from(usageTable).all()[0];
    expect(row?.images).toBe(2);
    expect(row?.costUsd).toBeCloseTo(0.0075 + 2 * 0.003, 10);
  });
});
