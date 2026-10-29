import { eq } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { orgMemorySettingsTable } from '../org-sqlite/schema/agent-memory.ts';

export interface MemoryCrawlRecord {
  lastCrawlAt: string | null;
  lastCrawlSummary: string | null;
}

export function embedModelIdOf(db: OrgSqliteDb, orgId: string): string | undefined {
  return modelIdOf(db, orgId, (row) => row.embedModelId);
}

export function saveEmbedModelId(
  db: OrgSqliteDb,
  orgId: string,
  modelId: string | undefined,
): void {
  saveModelId(db, orgId, { embedModelId: modelId ?? null });
}

export function decisionModelIdOf(db: OrgSqliteDb, orgId: string): string | undefined {
  return modelIdOf(db, orgId, (row) => row.decisionModelId);
}

export function saveDecisionModelId(
  db: OrgSqliteDb,
  orgId: string,
  modelId: string | undefined,
): void {
  saveModelId(db, orgId, { decisionModelId: modelId ?? null });
}

export function memoryCrawlRecord(db: OrgSqliteDb, orgId: string): MemoryCrawlRecord | undefined {
  const row = safeSettingsOf(db, orgId);
  if (!row) {
    return undefined;
  }
  return { lastCrawlAt: row.lastCrawlAt, lastCrawlSummary: row.lastCrawlSummary };
}

export function saveMemoryCrawlRecord(
  db: OrgSqliteDb,
  orgId: string,
  record: MemoryCrawlRecord,
): void {
  const next = {
    orgId,
    lastCrawlAt: record.lastCrawlAt,
    lastCrawlSummary: record.lastCrawlSummary,
    updatedAt: new Date().toISOString(),
  };
  db.insert(orgMemorySettingsTable)
    .values(next)
    .onConflictDoUpdate({
      target: orgMemorySettingsTable.orgId,
      set: {
        lastCrawlAt: next.lastCrawlAt,
        lastCrawlSummary: next.lastCrawlSummary,
        updatedAt: next.updatedAt,
      },
    })
    .run();
}

function modelIdOf(
  db: OrgSqliteDb,
  orgId: string,
  pick: (row: { embedModelId: string | null; decisionModelId: string | null }) => string | null,
): string | undefined {
  return (
    pick(safeSettingsOf(db, orgId) ?? { embedModelId: null, decisionModelId: null }) ?? undefined
  );
}

function saveModelId(
  db: OrgSqliteDb,
  orgId: string,
  patch: { embedModelId?: string | null; decisionModelId?: string | null },
): void {
  const updatedAt = new Date().toISOString();
  db.insert(orgMemorySettingsTable)
    .values({ orgId, ...patch, updatedAt })
    .onConflictDoUpdate({
      target: orgMemorySettingsTable.orgId,
      set: { ...patch, updatedAt },
    })
    .run();
}

function settingsOf(db: OrgSqliteDb, orgId: string) {
  return db
    .select()
    .from(orgMemorySettingsTable)
    .where(eq(orgMemorySettingsTable.orgId, orgId))
    .get();
}

function safeSettingsOf(db: OrgSqliteDb, orgId: string) {
  try {
    return settingsOf(db, orgId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('no such table')) {
      return undefined;
    }
    throw err;
  }
}
