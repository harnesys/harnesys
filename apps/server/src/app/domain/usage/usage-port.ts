import type {
  budgetMarksTable,
  priceOverridesTable,
  usageTable,
} from '../../infra/org-sqlite/schema/usage.ts';

export type UsageRecord = typeof usageTable.$inferSelect;
export type NewUsageRecord = typeof usageTable.$inferInsert;
export type BudgetMark = typeof budgetMarksTable.$inferSelect;
export type PriceOverride = typeof priceOverridesTable.$inferSelect;

export interface ManualPrice {
  inputPer1M: number;
  outputPer1M: number;
}

export type UsageGroupBy = 'day' | 'agent';

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

export interface UsageMemberAggregateRow {
  startedByUserId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  runs: number;
}

export interface UsageMemberNameRow {
  userId: string;
  name: string;
}

export function byMemberOf(
  rows: UsageMemberAggregateRow[],
  names: UsageMemberNameRow[],
): UsageMemberRow[] {
  const nameByUserId = new Map(names.map((row) => [row.userId, row.name] as const));
  return rows
    .map((row) => ({
      userId: row.startedByUserId,
      name: row.startedByUserId === null ? null : (nameByUserId.get(row.startedByUserId) ?? null),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      reasoningTokens: row.reasoningTokens,
      costUsd: row.costUsd,
      runs: row.runs,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);
}

export interface UsageReportRequest {
  orgId: string;
  groupBy?: string;
  from?: string;
  to?: string;
  agents?: string[];
  timezone?: string;
}

export type UsagePricingSource = 'provider' | 'manual' | 'catalog' | 'none';

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

export interface UsageRunsReportRequest {
  orgId: string;
  from?: string;
  to?: string;
  limit?: number;
}

export const USAGE_RUNS_LIMIT_DEFAULT = 50;
export const USAGE_RUNS_LIMIT_MAX = 200;

export function clampRunsLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return USAGE_RUNS_LIMIT_DEFAULT;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), USAGE_RUNS_LIMIT_MAX);
}

export abstract class UsagePort {
  abstract report(orgId: string, request: UsageReportRequest): UsageReport;
  abstract record(orgId: string, record: NewUsageRecord): void;
  abstract sumRunTokens(orgId: string, runId: string): number;
  abstract sumCostUsdByRunIds(orgId: string, runIds: string[]): number;
  abstract sumAgentDayCostUsd(
    orgId: string,
    agentId: string,
    fromIso: string,
    toIso: string,
  ): number;
  abstract runsReport(orgId: string, request: UsageRunsReportRequest): UsageRunsReport;
  abstract getPriceOverride(orgId: string, modelId: string): PriceOverride | null;
  abstract listPriceOverrides(orgId: string): PriceOverride[];
  abstract setPriceOverride(orgId: string, modelId: string, price: ManualPrice): void;
  abstract deletePriceOverride(orgId: string, modelId: string): boolean;
  abstract markBudgetMark(
    orgId: string,
    entityId: string,
    scope: string,
    percent: number,
    markedAt: string,
  ): boolean;
}
