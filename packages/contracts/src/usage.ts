import { z } from 'zod';

export const UsageQuerySchema = z.object({
  groupBy: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  agents: z.string().optional(),
});
export type UsageQuery = z.infer<typeof UsageQuerySchema>;

export const UsageRunsQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type UsageRunsQuery = z.infer<typeof UsageRunsQuerySchema>;

export const UsageGroupRowSchema = z.object({
  key: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  reasoningTokens: z.number(),
  costUsd: z.number(),
  unpriced: z.number(),
  runs: z.number(),
});
export type UsageGroupRow = z.infer<typeof UsageGroupRowSchema>;

export const UsageTotalsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  reasoningTokens: z.number(),
  costUsd: z.number(),
});
export type UsageTotals = z.infer<typeof UsageTotalsSchema>;

export const UsageMemberRowSchema = z.object({
  userId: z.string().nullable(),
  name: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  reasoningTokens: z.number(),
  costUsd: z.number(),
  runs: z.number(),
});
export type UsageMemberRow = z.infer<typeof UsageMemberRowSchema>;

export const UsageReportSchema = z.object({
  rows: z.array(UsageGroupRowSchema),
  totals: UsageTotalsSchema,
  byMember: z.array(UsageMemberRowSchema),
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

export const UsagePricingSourceSchema = z.enum(['provider', 'manual', 'catalog', 'none']);
export type UsagePricingSource = z.infer<typeof UsagePricingSourceSchema>;

export const UsageRunRowSchema = z.object({
  runId: z.string(),
  agentId: z.string().nullable(),
  model: z.string(),
  modelId: z.string().nullable(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUsd: z.number(),
  pricingSource: UsagePricingSourceSchema,
  ts: z.string(),
});
export type UsageRunRow = z.infer<typeof UsageRunRowSchema>;

export const UsageRunsTotalsSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number(),
  runs: z.number(),
});
export type UsageRunsTotals = z.infer<typeof UsageRunsTotalsSchema>;

export const UsageRunsReportSchema = z.object({
  rows: z.array(UsageRunRowSchema),
  totals: UsageRunsTotalsSchema,
});
export type UsageRunsReport = z.infer<typeof UsageRunsReportSchema>;

export const UsageIssuesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().optional(),
});
export type UsageIssuesQuery = z.infer<typeof UsageIssuesQuerySchema>;

export const UsageIssueRowSchema = z.object({
  issueId: z.string(),
  title: z.string(),
  statusKey: z.string(),
  agents: z.array(z.string()),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUsd: z.number(),
  runs: z.number(),
  lastTs: z.string(),
});
export type UsageIssueRow = z.infer<typeof UsageIssueRowSchema>;

export const UsageIssuesReportSchema = z.object({
  rows: z.array(UsageIssueRowSchema),
  totals: UsageRunsTotalsSchema,
});
export type UsageIssuesReport = z.infer<typeof UsageIssuesReportSchema>;
