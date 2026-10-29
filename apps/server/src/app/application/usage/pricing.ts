import type { ModelPricing, ModelPricingOverride } from '@harnesys/studio-shared';
import type { ManualPrice } from '../../domain/usage/usage-port.ts';

export type PricingSource = 'provider' | 'manual' | 'catalog' | 'none';

export interface PriceResolution {
  inputPer1M: number | null;
  outputPer1M: number | null;
  cacheReadPer1M: number | null;
  cacheWritePer1M: number | null;
  perImageUsd: number | null;
  perRequestUsd: number | null;
  source: PricingSource;
}

export interface ResolvePricingInput {
  catalogPricing?: ModelPricing | null;
  override?: ManualPrice | null;
  promptTokens?: number | null;
}

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  reasoningTokens: number | null;
  images: number | null;
  providerReportedCostUsd: number | null;
  recognized: boolean;
}

export interface UsageCost {
  costUsd: number;
  pricingSource: PricingSource;
}

const TOKEN_INPUT_KEYS = [
  'inputTokens',
  'promptTokens',
  'input_tokens',
  'prompt_tokens',
  'input',
] as const;
const TOKEN_OUTPUT_KEYS = [
  'outputTokens',
  'generatedTokens',
  'output_tokens',
  'completion_tokens',
  'output',
] as const;
const TOKEN_CACHE_READ_KEYS = [
  'cacheReadTokens',
  'cache_read_tokens',
  'cache_read_input_tokens',
  'cacheRead',
  'cachedInputTokens',
] as const;
const TOKEN_CACHE_WRITE_KEYS = [
  'cacheWriteTokens',
  'cache_write_tokens',
  'cache_creation_input_tokens',
  'cacheWrite',
] as const;
const TOKEN_REASONING_KEYS = ['reasoningTokens', 'reasoning_tokens', 'reasoning'] as const;
const PROVIDER_COST_KEYS = ['cost_usd', 'costUSD', 'total_cost'] as const;
const IMAGE_COUNT_KEYS = ['images', 'image_count'] as const;

const PER_MILLION = 1_000_000;

export function resolvePricing(input: ResolvePricingInput): PriceResolution {
  if (input.override) {
    const overrideInput = input.override.inputPer1M;
    const overrideOutput = input.override.outputPer1M;
    if (isFiniteNumber(overrideInput) && isFiniteNumber(overrideOutput)) {
      return {
        inputPer1M: overrideInput,
        outputPer1M: overrideOutput,
        cacheReadPer1M: null,
        cacheWritePer1M: null,
        perImageUsd: null,
        perRequestUsd: null,
        source: 'manual',
      };
    }
  }
  const catalog = catalogPricesOf(input.catalogPricing, input.promptTokens ?? null);
  if (catalog) {
    return { ...catalog, source: 'catalog' };
  }
  return {
    inputPer1M: null,
    outputPer1M: null,
    cacheReadPer1M: null,
    cacheWritePer1M: null,
    perImageUsd: null,
    perRequestUsd: null,
    source: 'none',
  };
}

export function costUsd(
  resolution: PriceResolution,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
    images?: number | null;
  },
): number {
  let total = 0;
  total += term(usage.inputTokens, resolution.inputPer1M);
  total += term(usage.outputTokens, resolution.outputPer1M);
  total += term(usage.cacheReadTokens, resolution.cacheReadPer1M);
  total += term(usage.cacheWriteTokens, resolution.cacheWritePer1M);
  total += imageTerm(usage.images ?? null, resolution.perImageUsd);
  total += resolution.perRequestUsd ?? 0;
  return total;
}

export function priceUsage(input: {
  usage: NormalizedUsage;
  catalogPricing?: ModelPricing | null;
  override?: ManualPrice | null;
}): UsageCost {
  const providerCost = input.usage.providerReportedCostUsd;
  if (isFiniteNumber(providerCost)) {
    return { costUsd: providerCost, pricingSource: 'provider' };
  }
  if (!input.usage.recognized) {
    return { costUsd: 0, pricingSource: 'none' };
  }
  const resolution = resolvePricing({
    catalogPricing: input.catalogPricing,
    override: input.override,
    promptTokens: input.usage.inputTokens,
  });
  return { costUsd: costUsd(resolution, input.usage), pricingSource: resolution.source };
}

export function normalizeUsage(raw: unknown): NormalizedUsage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      reasoningTokens: null,
      images: null,
      providerReportedCostUsd: null,
      recognized: false,
    };
  }
  const record = raw as Record<string, unknown>;
  const inputTokens = firstFiniteOf(record, TOKEN_INPUT_KEYS);
  const outputTokens = firstFiniteOf(record, TOKEN_OUTPUT_KEYS);
  const cacheReadTokens = firstFiniteOf(record, TOKEN_CACHE_READ_KEYS);
  const cacheWriteTokens = firstFiniteOf(record, TOKEN_CACHE_WRITE_KEYS);
  const reasoningTokens = firstFiniteOf(record, TOKEN_REASONING_KEYS);
  const providerReportedCostUsd = firstFiniteOf(record, PROVIDER_COST_KEYS);
  const images = imageCountOf(record);
  const recognized =
    inputTokens !== null ||
    outputTokens !== null ||
    providerReportedCostUsd !== null ||
    images !== null;
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
    images,
    providerReportedCostUsd,
    recognized,
  };
}

function catalogPricesOf(
  pricing: ModelPricing | null | undefined,
  promptTokens: number | null,
): Omit<PriceResolution, 'source'> | null {
  if (!pricing || typeof pricing !== 'object') {
    return null;
  }
  const effective = effectivePrices(pricing, promptTokens);
  const inputPer1M = per1M(effective.prompt);
  const outputPer1M = per1M(effective.completion);
  const cacheReadPer1M = per1M(effective.input_cache_read);
  const cacheWritePer1M = per1M(effective.input_cache_write);
  const perImageUsd = parsePrice(effective.image);
  const perRequestUsd = parsePrice(effective.request);
  if (
    inputPer1M === null &&
    outputPer1M === null &&
    cacheReadPer1M === null &&
    cacheWritePer1M === null &&
    perImageUsd === null &&
    perRequestUsd === null
  ) {
    return null;
  }
  return {
    inputPer1M,
    outputPer1M,
    cacheReadPer1M,
    cacheWritePer1M,
    perImageUsd,
    perRequestUsd,
  };
}

interface EffectivePrices {
  prompt: string | undefined;
  completion: string | undefined;
  input_cache_read: string | undefined;
  input_cache_write: string | undefined;
  image: string | undefined;
  request: string | undefined;
}

function effectivePrices(pricing: ModelPricing, promptTokens: number | null): EffectivePrices {
  const applicable = applicableOverrides(pricing.overrides, promptTokens);
  return {
    prompt: overriddenPrice(applicable, 'prompt') ?? pricing.prompt,
    completion: overriddenPrice(applicable, 'completion') ?? pricing.completion,
    input_cache_read: overriddenPrice(applicable, 'input_cache_read') ?? pricing.input_cache_read,
    input_cache_write:
      overriddenPrice(applicable, 'input_cache_write') ?? pricing.input_cache_write,
    image: overriddenPrice(applicable, 'image') ?? pricing.image,
    request: overriddenPrice(applicable, 'request') ?? pricing.request,
  };
}

function applicableOverrides(
  overrides: ModelPricingOverride[] | undefined,
  promptTokens: number | null,
): ModelPricingOverride[] {
  if (!overrides || overrides.length === 0 || promptTokens === null) {
    return [];
  }
  return overrides
    .filter((override) => {
      const threshold = override.minPromptTokens;
      return isFiniteNumber(threshold) && threshold > 0 && threshold <= promptTokens;
    })
    .sort((left, right) => left.minPromptTokens - right.minPromptTokens);
}

function overriddenPrice(
  overrides: ModelPricingOverride[],
  key: 'prompt' | 'completion' | 'input_cache_read' | 'input_cache_write' | 'image' | 'request',
): string | undefined {
  let price: string | undefined;
  for (const override of overrides) {
    const value = override[key];
    if (value !== undefined) {
      price = value;
    }
  }
  return price;
}

function per1M(value: string | undefined): number | null {
  const perToken = parsePrice(value);
  return perToken === null ? null : perToken * PER_MILLION;
}

function parsePrice(value: string | undefined): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function imageCountOf(record: Record<string, unknown>): number | null {
  const direct = firstPositiveOf(record, IMAGE_COUNT_KEYS);
  if (direct !== null) {
    return direct;
  }
  const nested = record.raw;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return null;
  }
  return firstPositiveOf(nested as Record<string, unknown>, IMAGE_COUNT_KEYS);
}

function firstPositiveOf(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (isFiniteNumber(value) && value > 0) {
      return value;
    }
  }
  return null;
}

function firstFiniteOf(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (isFiniteNumber(value)) {
      return value;
    }
  }
  return null;
}

function term(tokens: number | null, pricePer1M: number | null): number {
  if (tokens === null || pricePer1M === null) {
    return 0;
  }
  return (tokens / PER_MILLION) * pricePer1M;
}

function imageTerm(images: number | null, perImageUsd: number | null): number {
  if (images === null || perImageUsd === null) {
    return 0;
  }
  return images * perImageUsd;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
