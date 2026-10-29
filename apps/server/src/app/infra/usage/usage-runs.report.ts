import { and, gte, lte, sql } from 'drizzle-orm';
import type { UsageRunsReport } from '../../domain/usage/usage-port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { usageTable } from '../org-sqlite/schema/usage.ts';
import { pricingSourceOf } from './usage-report.helpers.ts';

export function selectRunsReport(
  db: OrgSqliteDb,
  from: string,
  to: string,
  limit: number,
): UsageRunsReport {
  const filter = and(gte(usageTable.ts, from), lte(usageTable.ts, to));
  const rows = db
    .select({
      runId: usageTable.runId,
      agentId: usageTable.agentId,
      model: usageTable.model,
      modelId: usageTable.modelId,
      inputTokens: sql<number>`sum(${usageTable.inputTokens})`,
      outputTokens: sql<number>`sum(${usageTable.outputTokens})`,
      cacheReadTokens: sql<number>`sum(coalesce(${usageTable.cacheReadTokens}, 0))`,
      cacheWriteTokens: sql<number>`sum(coalesce(${usageTable.cacheWriteTokens}, 0))`,
      costUsd: sql<number>`sum(${usageTable.costUsd})`,
      pricingSource: usageTable.pricingSource,
      ts: sql<string>`max(${usageTable.ts})`,
    })
    .from(usageTable)
    .where(filter)
    .groupBy(usageTable.runId, usageTable.model)
    .orderBy(sql`sum(${usageTable.costUsd}) desc`)
    .limit(limit)
    .all();
  const totals = db
    .select({
      inputTokens: sql<number>`sum(${usageTable.inputTokens})`,
      outputTokens: sql<number>`sum(${usageTable.outputTokens})`,
      costUsd: sql<number>`sum(${usageTable.costUsd})`,
      runs: sql<number>`count(distinct ${usageTable.runId})`,
    })
    .from(usageTable)
    .where(filter)
    .get();
  return {
    rows: rows.map((row) => ({
      runId: row.runId,
      agentId: row.agentId,
      model: row.model,
      modelId: row.modelId,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      costUsd: row.costUsd,
      pricingSource: pricingSourceOf(row.pricingSource),
      ts: row.ts,
    })),
    totals: {
      inputTokens: totals?.inputTokens ?? 0,
      outputTokens: totals?.outputTokens ?? 0,
      costUsd: totals?.costUsd ?? 0,
      runs: totals?.runs ?? 0,
    },
  };
}
