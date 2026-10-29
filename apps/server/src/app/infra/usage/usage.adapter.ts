import { Injectable } from '@harnesys/brix';
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { UsageValidationError } from '../../domain/usage/usage.errors.ts';
import type {
  ManualPrice,
  NewUsageRecord,
  PriceOverride,
  UsageMemberAggregateRow,
  UsageMemberNameRow,
  UsagePort,
  UsageReport,
  UsageReportRequest,
  UsageRunsReport,
  UsageRunsReportRequest,
} from '../../domain/usage/usage-port.ts';
import { byMemberOf, clampRunsLimit } from '../../domain/usage/usage-port.ts';
import { type OrgSqliteDb, withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { runsTable } from '../org-sqlite/schema/runs.ts';
import { budgetMarksTable, priceOverridesTable, usageTable } from '../org-sqlite/schema/usage.ts';
import { keyExpressionOf, reportRangeOffsetModifier } from './usage-report.helpers.ts';
import { selectRunsReport } from './usage-runs.report.ts';

@Injectable()
export class UsageAdapter implements UsagePort {
  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly users: UserRepository,
    private readonly memberships: MembershipRepository,
  ) {}

  private memberNames(orgId: string): UsageMemberNameRow[] {
    const rows: UsageMemberNameRow[] = [];
    for (const membership of this.memberships.listByOrg(orgId)) {
      const user = this.users.findById(membership.userId);
      if (user) {
        rows.push({ userId: user.id, name: user.name });
      }
    }
    return rows;
  }

  report(orgId: string, request: UsageReportRequest): UsageReport {
    const groupBy = this.groupByOf(request.groupBy);
    const from = request.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = request.to ?? new Date().toISOString();
    const modifier = reportRangeOffsetModifier(request.timezone, from);
    return withOrgSqlite(this.layout, orgId, (db) => {
      const keyExpr = keyExpressionOf(groupBy, usageTable.agentId, modifier);
      const rows = db
        .select({
          key: keyExpr,
          inputTokens: sql<number>`sum(${usageTable.inputTokens})`,
          outputTokens: sql<number>`sum(${usageTable.outputTokens})`,
          cacheReadTokens: sql<number>`sum(coalesce(${usageTable.cacheReadTokens}, 0))`,
          cacheWriteTokens: sql<number>`sum(coalesce(${usageTable.cacheWriteTokens}, 0))`,
          reasoningTokens: sql<number>`sum(coalesce(${usageTable.reasoningTokens}, 0))`,
          costUsd: sql<number>`sum(${usageTable.costUsd})`,
          unpriced: sql<number>`sum(case when ${usageTable.pricingSource} = 'none' then 1 else 0 end)`,
          runs: sql<number>`count(*)`,
        })
        .from(usageTable)
        .where(
          and(
            gte(usageTable.ts, from),
            lte(usageTable.ts, to),
            request.agents && request.agents.length > 0
              ? inArray(usageTable.agentId, request.agents)
              : undefined,
          ),
        )
        .groupBy(keyExpr)
        .orderBy(sql`sum(${usageTable.costUsd}) desc`)
        .all();
      const totals = rows.reduce(
        (acc, row) => ({
          inputTokens: acc.inputTokens + row.inputTokens,
          outputTokens: acc.outputTokens + row.outputTokens,
          cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
          cacheWriteTokens: acc.cacheWriteTokens + row.cacheWriteTokens,
          reasoningTokens: acc.reasoningTokens + row.reasoningTokens,
          costUsd: acc.costUsd + row.costUsd,
        }),
        {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          reasoningTokens: 0,
          costUsd: 0,
        },
      );
      const memberRows = this.memberAggregate(db, from, to, request.agents);
      const byMember = byMemberOf(memberRows, this.memberNames(orgId));
      return { rows, totals, byMember };
    });
  }

  private memberAggregate(
    db: OrgSqliteDb,
    from: string,
    to: string,
    agents?: string[],
  ): UsageMemberAggregateRow[] {
    const keyExpr = runsTable.startedByUserId;
    return db
      .select({
        startedByUserId: keyExpr,
        inputTokens: sql<number>`sum(${usageTable.inputTokens})`,
        outputTokens: sql<number>`sum(${usageTable.outputTokens})`,
        cacheReadTokens: sql<number>`sum(coalesce(${usageTable.cacheReadTokens}, 0))`,
        cacheWriteTokens: sql<number>`sum(coalesce(${usageTable.cacheWriteTokens}, 0))`,
        reasoningTokens: sql<number>`sum(coalesce(${usageTable.reasoningTokens}, 0))`,
        costUsd: sql<number>`sum(${usageTable.costUsd})`,
        runs: sql<number>`count(distinct ${usageTable.runId})`,
      })
      .from(usageTable)
      .leftJoin(runsTable, eq(usageTable.runId, runsTable.runId))
      .where(
        and(
          gte(usageTable.ts, from),
          lte(usageTable.ts, to),
          agents && agents.length > 0 ? inArray(usageTable.agentId, agents) : undefined,
        ),
      )
      .groupBy(keyExpr)
      .all();
  }

  record(orgId: string, record: NewUsageRecord): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.insert(usageTable).values(record).run();
    });
  }

  sumRunTokens(orgId: string, runId: string): number {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const result = db
        .select({ total: sql<number>`sum(${usageTable.inputTokens} + ${usageTable.outputTokens})` })
        .from(usageTable)
        .where(eq(usageTable.runId, runId))
        .get();
      return result?.total ?? 0;
    });
  }

  sumCostUsdByRunIds(orgId: string, runIds: string[]): number {
    if (runIds.length === 0) {
      return 0;
    }
    return withOrgSqlite(this.layout, orgId, (db) => {
      const result = db
        .select({ total: sql<number>`sum(${usageTable.costUsd})` })
        .from(usageTable)
        .where(inArray(usageTable.runId, runIds))
        .get();
      return result?.total ?? 0;
    });
  }

  sumAgentDayCostUsd(orgId: string, agentId: string, fromIso: string, toIso: string): number {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const result = db
        .select({ total: sql<number>`sum(${usageTable.costUsd})` })
        .from(usageTable)
        .where(
          and(
            eq(usageTable.agentId, agentId),
            gte(usageTable.ts, fromIso),
            lt(usageTable.ts, toIso),
          ),
        )
        .get();
      return result?.total ?? 0;
    });
  }

  runsReport(orgId: string, request: UsageRunsReportRequest): UsageRunsReport {
    const from = request.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = request.to ?? new Date().toISOString();
    const limit = clampRunsLimit(request.limit);
    return withOrgSqlite(this.layout, orgId, (db) => selectRunsReport(db, from, to, limit));
  }

  getPriceOverride(orgId: string, modelId: string): PriceOverride | null {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const result = db
        .select()
        .from(priceOverridesTable)
        .where(eq(priceOverridesTable.modelId, modelId))
        .limit(1)
        .get();
      return result ?? null;
    });
  }

  listPriceOverrides(orgId: string): PriceOverride[] {
    return withOrgSqlite(this.layout, orgId, (db) => db.select().from(priceOverridesTable).all());
  }

  setPriceOverride(orgId: string, modelId: string, price: ManualPrice): void {
    withOrgSqlite(this.layout, orgId, (db) => {
      db.insert(priceOverridesTable)
        .values({ modelId, inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M })
        .onConflictDoUpdate({
          target: priceOverridesTable.modelId,
          set: { inputPer1M: price.inputPer1M, outputPer1M: price.outputPer1M },
        })
        .run();
    });
  }

  deletePriceOverride(orgId: string, modelId: string): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const removed = db
        .delete(priceOverridesTable)
        .where(eq(priceOverridesTable.modelId, modelId))
        .returning({ modelId: priceOverridesTable.modelId })
        .get();
      return removed !== undefined;
    });
  }

  markBudgetMark(
    orgId: string,
    entityId: string,
    scope: string,
    percent: number,
    markedAt: string,
  ): boolean {
    return withOrgSqlite(this.layout, orgId, (db) => {
      const existing = db
        .select()
        .from(budgetMarksTable)
        .where(
          and(
            eq(budgetMarksTable.entityId, entityId),
            eq(budgetMarksTable.scope, scope),
            eq(budgetMarksTable.percent, percent),
          ),
        )
        .limit(1)
        .get();
      if (existing) {
        return false;
      }
      db.insert(budgetMarksTable).values({ entityId, scope, percent, markedAt }).run();
      return true;
    });
  }

  private groupByOf(value: string | undefined): 'day' | 'hour' | 'minute' | 'agent' {
    if (value === undefined || value === 'day') {
      return 'day';
    }
    if (value === 'hour' || value === 'minute' || value === 'agent') {
      return value;
    }
    throw new UsageValidationError('groupBy must be one of day, hour, minute, agent');
  }
}
