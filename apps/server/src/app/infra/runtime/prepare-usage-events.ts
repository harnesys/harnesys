import { eq } from 'drizzle-orm';
import type { PendingSessionEvent } from 'harnesys';
import {
  type NormalizedUsage,
  normalizeUsage,
  priceUsage,
  type UsageCost,
} from '../../application/usage/pricing.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { threadsTable } from '../org-sqlite/schema/threads.ts';
import { usageTable } from '../org-sqlite/schema/usage.ts';
import { usagePriceSources } from './usage-price-source.ts';

export function prepareUsageEvents(
  tx: OrgSqliteDb,
  runId: string,
  threadId: string,
  events: PendingSessionEvent[],
): PendingSessionEvent[] {
  if (!events.some((event) => event.type === 'model.usage')) {
    return events;
  }
  const threadAgentId = threadAgentIdOf(tx, threadId);
  return events.map((event) => {
    if (event.type !== 'model.usage') {
      return event;
    }
    const usage = normalizeUsage(event.usage);
    const model = event.usage.model ?? '';
    const modelId = event.usage.modelId ?? null;
    const cost = costOf(tx, { model, modelId, usage });
    recordUsage(tx, {
      runId,
      agentId: event.agentId ?? threadAgentId,
      model,
      modelId,
      usage,
      cost,
    });
    return { ...event, costUsd: cost.costUsd, pricingSource: cost.pricingSource };
  });
}

function costOf(
  tx: OrgSqliteDb,
  input: { model: string; modelId: string | null; usage: NormalizedUsage },
): UsageCost {
  try {
    const sources = usagePriceSources(tx, { model: input.model, modelId: input.modelId });
    return priceUsage({
      usage: input.usage,
      catalogPricing: sources.catalogPricing,
      override: sources.override,
    });
  } catch {
    return { costUsd: 0, pricingSource: 'none' };
  }
}

function recordUsage(
  tx: OrgSqliteDb,
  input: {
    runId: string;
    agentId: string | null;
    model: string;
    modelId: string | null;
    usage: NormalizedUsage;
    cost: UsageCost;
  },
): void {
  try {
    tx.insert(usageTable)
      .values({
        id: crypto.randomUUID(),
        ts: new Date().toISOString(),
        projectId: null,
        agentId: input.agentId,
        runId: input.runId,
        model: input.model,
        modelId: input.modelId,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        cacheReadTokens: input.usage.cacheReadTokens,
        cacheWriteTokens: input.usage.cacheWriteTokens,
        reasoningTokens: input.usage.reasoningTokens,
        images: input.usage.images,
        costUsd: input.cost.costUsd,
        pricingSource: input.cost.pricingSource,
      })
      .run();
  } catch {
    // usage recording is best-effort
  }
}

function threadAgentIdOf(tx: OrgSqliteDb, threadId: string): string | null {
  const thread = tx
    .select({ agentId: threadsTable.agentId })
    .from(threadsTable)
    .where(eq(threadsTable.id, threadId))
    .get();
  return thread?.agentId ?? null;
}
