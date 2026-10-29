import { eq } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  knowledgeChunksTable,
  knowledgeFilesTable,
  knowledgeIndexStateTable,
  knowledgeRootsTable,
  knowledgeSettingsTable,
} from '../org-sqlite/schema/index.ts';

export function deleteKnowledgeForSource(db: OrgSqliteDb, sourceId: string): void {
  db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.sourceId, sourceId)).run();
  db.delete(knowledgeFilesTable).where(eq(knowledgeFilesTable.sourceId, sourceId)).run();
  db.delete(knowledgeRootsTable).where(eq(knowledgeRootsTable.sourceId, sourceId)).run();
  db.delete(knowledgeSettingsTable).where(eq(knowledgeSettingsTable.sourceId, sourceId)).run();
  db.delete(knowledgeIndexStateTable).where(eq(knowledgeIndexStateTable.sourceId, sourceId)).run();
}
