export type UsageGroupBy = 'day' | 'hour' | 'minute' | 'agent';

export interface UsageGroupRow {
  key: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  unpriced: number;
  runs: number;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
}

export interface UsageMemberRow {
  userId: string | null;
  name: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  runs: number;
}

export interface UsageReport {
  rows: UsageGroupRow[];
  totals: UsageTotals;
  byMember: UsageMemberRow[];
}

export type UsagePricingSource = 'catalog' | 'manual' | 'provider' | 'none';

export interface UsageRunRow {
  runId: string;
  agentId: string | null;
  model: string;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  pricingSource: UsagePricingSource;
  ts: string;
}

export interface UsageRunsTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  runs: number;
}

export interface UsageRunsReport {
  rows: UsageRunRow[];
  totals: UsageRunsTotals;
}

export interface PriceOverride {
  modelId: string;
  inputPer1M: number;
  outputPer1M: number;
}

export interface PriceOverridesResponse {
  overrides: PriceOverride[];
}
