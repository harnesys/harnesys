import { and, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { UsageIssuesReport } from '../../domain/usage/usage-port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { issueExecutionsTable } from '../org-sqlite/schema/issue-executions.ts';
import { issuesTable } from '../org-sqlite/schema/issues.ts';
import { usageTable } from '../org-sqlite/schema/usage.ts';

export function selectIssuesReport(
  db: OrgSqliteDb,
  from: string,
  to: string,
  limit: number,
): UsageIssuesReport {
  const filter = and(gte(usageTable.ts, from), lte(usageTable.ts, to), isNotNull(usageTable.runId));
  const joined = db
    .select({
      issueId: issuesTable.id,
      title: issuesTable.title,
      statusKey: issuesTable.statusKey,
      agents: sql<string | null>`group_concat(distinct ${usageTable.agentId})`.as('agents'),
      inputTokens: sql<number>`sum(${usageTable.inputTokens})`.as('inputTokens'),
      outputTokens: sql<number>`sum(${usageTable.outputTokens})`.as('outputTokens'),
      cacheReadTokens: sql<number>`sum(coalesce(${usageTable.cacheReadTokens}, 0))`.as(
        'cacheReadTokens',
      ),
      cacheWriteTokens: sql<number>`sum(coalesce(${usageTable.cacheWriteTokens}, 0))`.as(
        'cacheWriteTokens',
      ),
      costUsd: sql<number>`sum(${usageTable.costUsd})`.as('costUsd'),
      runs: sql<number>`count(distinct ${usageTable.runId})`.as('runs'),
      lastTs: sql<string>`max(${usageTable.ts})`.as('lastTs'),
    })
    .from(usageTable)
    .innerJoin(issueExecutionsTable, eq(usageTable.runId, issueExecutionsTable.runId))
    .innerJoin(issuesTable, eq(issueExecutionsTable.issueId, issuesTable.id))
    .where(filter)
    .groupBy(issuesTable.id)
    .as('issue_usage');
  const rows = db.select().from(joined).orderBy(desc(joined.costUsd)).limit(limit).all();
  const totals = db
    .select({
      inputTokens: sql<number>`sum(${joined.inputTokens})`,
      outputTokens: sql<number>`sum(${joined.outputTokens})`,
      costUsd: sql<number>`sum(${joined.costUsd})`,
      runs: sql<number>`sum(${joined.runs})`,
    })
    .from(joined)
    .get();
  return {
    rows: rows.map((row) => ({
      issueId: row.issueId,
      title: row.title,
      statusKey: row.statusKey,
      agents: row.agents === null ? [] : row.agents.split(',').filter((id) => id.length > 0),
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      costUsd: row.costUsd,
      runs: row.runs,
      lastTs: row.lastTs,
    })),
    totals: {
      inputTokens: totals?.inputTokens ?? 0,
      outputTokens: totals?.outputTokens ?? 0,
      costUsd: totals?.costUsd ?? 0,
      runs: totals?.runs ?? 0,
    },
  };
}
