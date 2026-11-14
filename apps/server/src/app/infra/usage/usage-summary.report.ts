import { and, eq, gte, sql } from 'drizzle-orm';
import type { UsageSummary } from '../../domain/usage/usage-port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/runs.ts';
import { usageTable } from '../org-sqlite/schema/usage.ts';

interface UsageModelAggregateRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const modelAggregate = {
  model: usageTable.model,
  inputTokens: sql<number>`sum(${usageTable.inputTokens})`,
  outputTokens: sql<number>`sum(${usageTable.outputTokens})`,
  costUsd: sql<number>`sum(${usageTable.costUsd})`,
};

export function selectUsageSummary(
  db: OrgSqliteDb,
  request: { threadId?: string; since?: string },
): UsageSummary {
  const sinceFilter = request.since !== undefined ? gte(usageTable.ts, request.since) : undefined;
  const rows: UsageModelAggregateRow[] =
    request.threadId !== undefined
      ? db
          .select(modelAggregate)
          .from(usageTable)
          .innerJoin(runsTable, eq(usageTable.runId, runsTable.runId))
          .where(and(eq(runsTable.threadId, request.threadId), sinceFilter))
          .groupBy(usageTable.model)
          .all()
      : db
          .select(modelAggregate)
          .from(usageTable)
          .where(sinceFilter)
          .groupBy(usageTable.model)
          .all();
  const byModel = [...rows].sort((a, b) => b.costUsd - a.costUsd);
  return {
    inputTokens: byModel.reduce((acc, row) => acc + row.inputTokens, 0),
    outputTokens: byModel.reduce((acc, row) => acc + row.outputTokens, 0),
    costUsd: byModel.reduce((acc, row) => acc + row.costUsd, 0),
    byModel,
  };
}
