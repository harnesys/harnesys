import { eq, sql } from 'drizzle-orm';
import { DEFAULT_KNOWLEDGE_SETTINGS } from '../../../const.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  type KnowledgeIndexStateRow,
  type KnowledgeSettingsRow,
  knowledgeIndexStateTable,
  knowledgeSettingsTable,
} from '../org-sqlite/schema/index.ts';
import type {
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
  UpsertKnowledgeSettingsRequest,
} from './knowledge-index-types.ts';
export function getSettingsOrDefault(db: OrgSqliteDb, sourceId: string): KnowledgeSettingsRecord {
  const row = db
    .select()
    .from(knowledgeSettingsTable)
    .where(eq(knowledgeSettingsTable.sourceId, sourceId))
    .get();
  if (row) {
    return toSettings(row);
  }
  const now = new Date().toISOString();
  const inserted = db
    .insert(knowledgeSettingsTable)
    .values({
      sourceId,
      entireSource: DEFAULT_KNOWLEDGE_SETTINGS.entireSource,
      backend: DEFAULT_KNOWLEDGE_SETTINGS.backend,
      embedProvider: DEFAULT_KNOWLEDGE_SETTINGS.embedProvider,
      embedModel: DEFAULT_KNOWLEDGE_SETTINGS.embedModel,
      watchEnabled: DEFAULT_KNOWLEDGE_SETTINGS.watchEnabled,
      updatedAt: now,
    })
    .returning()
    .get();
  return toSettings(inserted);
}
export function putSettings(
  db: OrgSqliteDb,
  sourceId: string,
  patch: UpsertKnowledgeSettingsRequest,
): KnowledgeSettingsRecord {
  const current = getSettingsOrDefault(db, sourceId);
  const next: KnowledgeSettingsRecord = {
    sourceId,
    entireSource: patch.entireSource ?? current.entireSource,
    backend: patch.backend ?? current.backend,
    embedProvider: patch.embedProvider === undefined ? current.embedProvider : patch.embedProvider,
    embedModel: patch.embedModel === undefined ? current.embedModel : patch.embedModel,
    watchEnabled: patch.watchEnabled ?? current.watchEnabled,
    updatedAt: new Date().toISOString(),
  };
  db.insert(knowledgeSettingsTable)
    .values(next)
    .onConflictDoUpdate({
      target: knowledgeSettingsTable.sourceId,
      set: {
        entireSource: next.entireSource,
        backend: next.backend,
        embedProvider: next.embedProvider,
        embedModel: next.embedModel,
        watchEnabled: next.watchEnabled,
        updatedAt: next.updatedAt,
      },
    })
    .run();
  return next;
}
export function getIndexState(db: OrgSqliteDb, sourceId: string): KnowledgeIndexStateRecord {
  const row = db
    .select()
    .from(knowledgeIndexStateTable)
    .where(eq(knowledgeIndexStateTable.sourceId, sourceId))
    .get();
  if (row) {
    return toState(row);
  }
  return {
    sourceId,
    status: 'idle',
    phase: null,
    processed: 0,
    total: 0,
    lastError: null,
    startedAt: null,
    finishedAt: null,
  };
}
export function listIndexStates(db: OrgSqliteDb): KnowledgeIndexStateRecord[] {
  return db.select().from(knowledgeIndexStateTable).all().map(toState);
}
export function upsertIndexState(
  db: OrgSqliteDb,
  sourceId: string,
  patch: KnowledgeIndexStatePatch,
): KnowledgeIndexStateRecord {
  const current = getIndexState(db, sourceId);
  const next = {
    sourceId,
    status: patch.status ?? current.status,
    phase: patch.phase === undefined ? current.phase : patch.phase,
    processed: patch.processed ?? current.processed,
    total: patch.total ?? current.total,
    lastError: patch.lastError === undefined ? current.lastError : patch.lastError,
    startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
    finishedAt: patch.finishedAt === undefined ? current.finishedAt : patch.finishedAt,
  };
  db.insert(knowledgeIndexStateTable)
    .values(next)
    .onConflictDoUpdate({
      target: knowledgeIndexStateTable.sourceId,
      set: {
        status: next.status,
        phase: next.phase,
        processed: next.processed,
        total: next.total,
        lastError: next.lastError,
        startedAt: next.startedAt,
        finishedAt: next.finishedAt,
      },
    })
    .run();
  return next;
}
export function bumpProcessed(db: OrgSqliteDb, sourceId: string): void {
  db.update(knowledgeIndexStateTable)
    .set({ processed: sql`${knowledgeIndexStateTable.processed} + 1` })
    .where(eq(knowledgeIndexStateTable.sourceId, sourceId))
    .run();
}
function toSettings(row: KnowledgeSettingsRow): KnowledgeSettingsRecord {
  return {
    sourceId: row.sourceId,
    entireSource: row.entireSource,
    backend: row.backend,
    embedProvider: row.embedProvider,
    embedModel: row.embedModel,
    watchEnabled: row.watchEnabled,
    updatedAt: row.updatedAt,
  };
}
function toState(row: KnowledgeIndexStateRow): KnowledgeIndexStateRecord {
  return {
    sourceId: row.sourceId,
    status: row.status,
    phase: row.phase,
    processed: row.processed,
    total: row.total,
    lastError: row.lastError,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}
