import type { ModelPricing, ModelPricingOverride } from '@harnesys/studio-shared';
import { eq } from 'drizzle-orm';
import { resolveModel } from 'harnesys';
import type { ManualPrice } from '../../domain/usage/usage-port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { llmModelsTable } from '../org-sqlite/schema/llm-models.ts';
import { priceOverridesTable } from '../org-sqlite/schema/usage.ts';

export interface UsagePriceSources {
  catalogPricing: ModelPricing | null;
  override: ManualPrice | null;
}

export function usagePriceSources(
  tx: OrgSqliteDb,
  input: { model: string; modelId: string | null },
): UsagePriceSources {
  return {
    catalogPricing: catalogPricingOf(tx, input.modelId),
    override: overrideOf(tx, input.modelId),
  };
}

function catalogPricingOf(tx: OrgSqliteDb, modelId: string | null): ModelPricing | null {
  if (!modelId) {
    return null;
  }
  const row = tx.select().from(llmModelsTable).where(eq(llmModelsTable.id, modelId)).get();
  if (!row) {
    return null;
  }
  const metadata = parseMetadata(row.metadata);
  const record = { ...metadata, name: row.name };
  const pricing: unknown = resolveModel(record).pricing;
  return pricingOf(pricing);
}

function overrideOf(tx: OrgSqliteDb, modelId: string | null): ManualPrice | null {
  if (!modelId) {
    return null;
  }
  const row = tx
    .select()
    .from(priceOverridesTable)
    .where(eq(priceOverridesTable.modelId, modelId))
    .limit(1)
    .get();
  if (!row) {
    return null;
  }
  return { inputPer1M: row.inputPer1M, outputPer1M: row.outputPer1M };
}

function pricingOf(raw: unknown): ModelPricing | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const prompt = priceString(record.prompt);
  const completion = priceString(record.completion);
  const inputCacheRead = priceString(record.input_cache_read);
  const inputCacheWrite = priceString(record.input_cache_write);
  const image = priceString(record.image);
  const request = priceString(record.request);
  if (
    prompt === undefined &&
    completion === undefined &&
    inputCacheRead === undefined &&
    inputCacheWrite === undefined &&
    image === undefined &&
    request === undefined
  ) {
    return null;
  }
  const overrides = pricingOverridesOf(record.overrides);
  return {
    prompt: prompt ?? '0',
    completion: completion ?? '0',
    input_cache_read: inputCacheRead,
    input_cache_write: inputCacheWrite,
    image,
    request,
    ...(overrides ? { overrides } : {}),
  };
}

function pricingOverridesOf(raw: unknown): ModelPricingOverride[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const overrides: ModelPricingOverride[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const minPromptTokens = numberOf(record.minPromptTokens);
    if (minPromptTokens === undefined || minPromptTokens <= 0) {
      continue;
    }
    overrides.push({
      minPromptTokens,
      prompt: priceString(record.prompt),
      completion: priceString(record.completion),
      input_cache_read: priceString(record.input_cache_read),
      input_cache_write: priceString(record.input_cache_write),
      image: priceString(record.image),
      request: priceString(record.request),
    });
  }
  return overrides.length > 0 ? overrides : undefined;
}

function parseMetadata(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function priceString(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? value.trim() : undefined;
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return undefined;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
