import type { KnowledgeRootRecord } from '@harnesys/studio-shared';
import { and, count, eq } from 'drizzle-orm';
import type { KnowledgeReadResult } from 'harnesys';
import { KnowledgeSourceNotFoundException } from '../../domain/knowledge/knowledge.error.ts';
import type { UpsertKnowledgeRootInput } from '../../domain/knowledge/knowledge-store.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import { knowledgeChunksTable, knowledgeRootsTable } from '../org-sqlite/schema/index.ts';

export function listKnowledgeRoots(db: OrgSqliteDb, sourceId: string): KnowledgeRootRecord[] {
  return db
    .select()
    .from(knowledgeRootsTable)
    .where(eq(knowledgeRootsTable.sourceId, sourceId))
    .all()
    .map((row) => ({
      sourceId: row.sourceId,
      path: row.path,
      enabled: row.enabled,
    }));
}

export function upsertKnowledgeRoot(
  db: OrgSqliteDb,
  input: UpsertKnowledgeRootInput,
): KnowledgeRootRecord {
  const enabled = input.enabled ?? true;
  const existing = db
    .select()
    .from(knowledgeRootsTable)
    .where(
      and(
        eq(knowledgeRootsTable.sourceId, input.sourceId),
        eq(knowledgeRootsTable.path, input.path),
      ),
    )
    .get();
  if (existing) {
    const row = db
      .update(knowledgeRootsTable)
      .set({ enabled })
      .where(
        and(
          eq(knowledgeRootsTable.sourceId, input.sourceId),
          eq(knowledgeRootsTable.path, input.path),
        ),
      )
      .returning()
      .get();
    return { sourceId: row.sourceId, path: row.path, enabled: row.enabled };
  }
  const row = db
    .insert(knowledgeRootsTable)
    .values({ sourceId: input.sourceId, path: input.path, enabled })
    .returning()
    .get();
  return { sourceId: row.sourceId, path: row.path, enabled: row.enabled };
}

export function deleteKnowledgeRoot(db: OrgSqliteDb, sourceId: string, path: string): void {
  db.delete(knowledgeRootsTable)
    .where(and(eq(knowledgeRootsTable.sourceId, sourceId), eq(knowledgeRootsTable.path, path)))
    .run();
}

export function countKnowledgeChunks(db: OrgSqliteDb, sourceId: string): number {
  const row = db
    .select({ value: count() })
    .from(knowledgeChunksTable)
    .where(eq(knowledgeChunksTable.sourceId, sourceId))
    .get();
  return row?.value ?? 0;
}

export function readKnowledgeChunk(
  db: OrgSqliteDb,
  sourceId: string,
  id: string,
): KnowledgeReadResult {
  const row = db
    .select()
    .from(knowledgeChunksTable)
    .where(and(eq(knowledgeChunksTable.id, id), eq(knowledgeChunksTable.sourceId, sourceId)))
    .get();
  if (!row) {
    throw new KnowledgeSourceNotFoundException('knowledge chunk not found');
  }
  return { id: row.id, text: row.text, ...(row.uri ? { uri: row.uri } : {}) };
}
