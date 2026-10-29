import { and, count, desc, eq, gte } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  memoryFactsTable,
  memoryPromotionsTable,
  runsTable,
  threadsTable,
} from '../org-sqlite/schema/index.ts';

const MEMORY_CRAWL_THREAD_DAYS = 30;
const MEMORY_CRAWL_THREAD_CAP = 20;

export function recentThreadsOf(db: OrgSqliteDb, orgId: string, agentId: string) {
  const since = new Date(Date.now() - MEMORY_CRAWL_THREAD_DAYS * DAY_MS).toISOString();
  return db
    .select()
    .from(threadsTable)
    .where(
      and(
        eq(threadsTable.orgId, orgId),
        eq(threadsTable.agentId, agentId),
        gte(threadsTable.updatedAt, since),
      ),
    )
    .orderBy(desc(threadsTable.updatedAt))
    .limit(MEMORY_CRAWL_THREAD_CAP)
    .all();
}

export function latestRunIdOf(db: OrgSqliteDb, threadId: string): string | undefined {
  return db
    .select({ runId: runsTable.runId })
    .from(runsTable)
    .where(eq(runsTable.threadId, threadId))
    .orderBy(desc(runsTable.createdAt), desc(runsTable.lastSeq))
    .limit(1)
    .get()?.runId;
}

export function countFacts(db: OrgSqliteDb, orgId: string, agentName: string): number {
  return (
    db
      .select({ value: count() })
      .from(memoryFactsTable)
      .where(and(eq(memoryFactsTable.orgId, orgId), eq(memoryFactsTable.agentName, agentName)))
      .get()?.value ?? 0
  );
}

export function countPromotions(db: OrgSqliteDb, orgId: string, agentName: string): number {
  return (
    db
      .select({ value: count() })
      .from(memoryPromotionsTable)
      .where(
        and(eq(memoryPromotionsTable.orgId, orgId), eq(memoryPromotionsTable.agentName, agentName)),
      )
      .get()?.value ?? 0
  );
}

const DAY_MS = 24 * 3_600_000;
