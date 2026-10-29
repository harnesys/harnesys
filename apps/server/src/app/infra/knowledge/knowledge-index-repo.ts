import { and, eq, sql } from 'drizzle-orm';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  type KnowledgeFileRow,
  knowledgeChunksTable,
  knowledgeFilesTable,
} from '../org-sqlite/schema/index.ts';
import {
  bumpProcessed as bumpProcessedRow,
  getIndexState,
  getSettingsOrDefault,
  listIndexStates,
  putSettings as putSettingsRow,
  upsertIndexState,
} from './knowledge-index-settings.ts';
import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
  UpsertKnowledgeFileInput,
  UpsertKnowledgeSettingsRequest,
} from './knowledge-index-types.ts';
export interface KnowledgeChunkInsertInput {
  id: string;
  sourceId: string;
  uri: string;
  title: string;
  text: string;
  embedding: Buffer | null;
  updatedAt: string;
}
export class SqliteKnowledgeIndexRepo {
  constructor(private readonly db: OrgSqliteDb) {}
  getSettingsOrDefault(sourceId: string): KnowledgeSettingsRecord {
    return getSettingsOrDefault(this.db, sourceId);
  }
  putSettings(sourceId: string, patch: UpsertKnowledgeSettingsRequest): KnowledgeSettingsRecord {
    return putSettingsRow(this.db, sourceId, patch);
  }
  getState(sourceId: string): KnowledgeIndexStateRecord {
    return getIndexState(this.db, sourceId);
  }
  listStates(): KnowledgeIndexStateRecord[] {
    return listIndexStates(this.db);
  }
  upsertState(sourceId: string, patch: KnowledgeIndexStatePatch): KnowledgeIndexStateRecord {
    return upsertIndexState(this.db, sourceId, patch);
  }
  bumpProcessed(sourceId: string): void {
    bumpProcessedRow(this.db, sourceId);
  }
  listFiles(sourceId: string, status?: KnowledgeFileStatus): KnowledgeFileRecord[] {
    const rows =
      status === undefined
        ? this.db
            .select()
            .from(knowledgeFilesTable)
            .where(eq(knowledgeFilesTable.sourceId, sourceId))
            .all()
        : this.db
            .select()
            .from(knowledgeFilesTable)
            .where(
              and(
                eq(knowledgeFilesTable.sourceId, sourceId),
                eq(knowledgeFilesTable.status, status),
              ),
            )
            .all();
    return rows.map(toFile);
  }
  countFilesByStatus(sourceId: string): KnowledgeFilesByStatus {
    const rows = this.db
      .select({
        status: knowledgeFilesTable.status,
        value: sql<number>`count(*)`,
      })
      .from(knowledgeFilesTable)
      .where(eq(knowledgeFilesTable.sourceId, sourceId))
      .groupBy(knowledgeFilesTable.status)
      .all();
    const out: KnowledgeFilesByStatus = { pending: 0, indexed: 0, skipped: 0, error: 0 };
    for (const row of rows) {
      out[row.status] = Number(row.value);
    }
    return out;
  }
  getFile(sourceId: string, uri: string): KnowledgeFileRecord | undefined {
    const row = this.db
      .select()
      .from(knowledgeFilesTable)
      .where(and(eq(knowledgeFilesTable.sourceId, sourceId), eq(knowledgeFilesTable.uri, uri)))
      .get();
    return row ? toFile(row) : undefined;
  }
  uriHasEmbeddings(sourceId: string, uri: string): boolean {
    const row = this.db
      .select({ id: knowledgeChunksTable.id })
      .from(knowledgeChunksTable)
      .where(
        and(
          eq(knowledgeChunksTable.sourceId, sourceId),
          eq(knowledgeChunksTable.uri, uri),
          sql`${knowledgeChunksTable.embedding} IS NOT NULL`,
        ),
      )
      .get();
    return row != null;
  }
  upsertFile(input: UpsertKnowledgeFileInput): void {
    this.db
      .insert(knowledgeFilesTable)
      .values({
        sourceId: input.sourceId,
        uri: input.uri,
        status: input.status,
        skipReason: input.skipReason ?? null,
        mtimeMs: input.mtimeMs ?? null,
        sizeBytes: input.sizeBytes ?? null,
        contentHash: input.contentHash ?? null,
        chunkCount: input.chunkCount ?? 0,
        lastError: input.lastError ?? null,
        updatedAt: input.updatedAt,
      })
      .onConflictDoUpdate({
        target: [knowledgeFilesTable.sourceId, knowledgeFilesTable.uri],
        set: {
          status: input.status,
          skipReason: input.skipReason ?? null,
          mtimeMs: input.mtimeMs ?? null,
          sizeBytes: input.sizeBytes ?? null,
          contentHash: input.contentHash ?? null,
          chunkCount: input.chunkCount ?? 0,
          lastError: input.lastError ?? null,
          updatedAt: input.updatedAt,
        },
      })
      .run();
  }
  listFileUris(sourceId: string): string[] {
    return this.db
      .select({ uri: knowledgeFilesTable.uri })
      .from(knowledgeFilesTable)
      .where(eq(knowledgeFilesTable.sourceId, sourceId))
      .all()
      .map((row) => row.uri);
  }
  deleteFileAndChunks(sourceId: string, uri: string): void {
    const variants = new Set([uri, uri.normalize('NFC'), uri.normalize('NFD')]);
    for (const v of variants) {
      this.deleteChunksForUri(sourceId, v);
      this.db
        .delete(knowledgeFilesTable)
        .where(and(eq(knowledgeFilesTable.sourceId, sourceId), eq(knowledgeFilesTable.uri, v)))
        .run();
    }
  }
  deleteUriPrefix(sourceId: string, prefix: string): void {
    for (const uri of this.listFileUris(sourceId)) {
      if (uri === prefix || uri.startsWith(`${prefix}/`)) {
        this.deleteFileAndChunks(sourceId, uri);
      }
    }
  }
  purgeByFirstSegment(sourceId: string, names: ReadonlySet<string>): void {
    for (const uri of this.listFileUris(sourceId)) {
      const slash = uri.indexOf('/');
      const segment = slash === -1 ? uri : uri.slice(0, slash);
      if (names.has(segment)) {
        this.deleteFileAndChunks(sourceId, uri);
      }
    }
  }
  deleteMissingFiles(sourceId: string, seenUris: ReadonlySet<string>): void {
    const existing = this.listFileUris(sourceId);
    for (const uri of existing) {
      if (!seenUris.has(uri)) {
        this.deleteFileAndChunks(sourceId, uri);
      }
    }
  }
  deleteChunksForUri(sourceId: string, uri: string): void {
    this.db
      .delete(knowledgeChunksTable)
      .where(and(eq(knowledgeChunksTable.sourceId, sourceId), eq(knowledgeChunksTable.uri, uri)))
      .run();
  }
  deleteAllChunks(sourceId: string): void {
    this.db.delete(knowledgeChunksTable).where(eq(knowledgeChunksTable.sourceId, sourceId)).run();
  }
  deleteOrphanChunks(sourceId: string, seenUris: ReadonlySet<string>): void {
    const chunkUris = this.db
      .selectDistinct({ uri: knowledgeChunksTable.uri })
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.sourceId, sourceId))
      .all()
      .map((r) => r.uri);
    const fileUris = new Set(this.listFileUris(sourceId));
    for (const uri of chunkUris) {
      const normalized = uri.normalize('NFC');
      if (!seenUris.has(normalized) && !fileUris.has(uri) && !fileUris.has(normalized)) {
        this.deleteChunksForUri(sourceId, uri);
        const alt = normalized !== uri ? normalized : undefined;
        if (alt) {
          this.deleteChunksForUri(sourceId, alt);
        }
      }
    }
  }
  insertChunks(rows: KnowledgeChunkInsertInput[]): void {
    if (rows.length === 0) {
      return;
    }
    this.db.insert(knowledgeChunksTable).values(rows).run();
  }
}
function toFile(row: KnowledgeFileRow): KnowledgeFileRecord {
  return {
    sourceId: row.sourceId,
    uri: row.uri,
    status: row.status,
    skipReason: row.skipReason,
    mtimeMs: row.mtimeMs,
    sizeBytes: row.sizeBytes,
    contentHash: row.contentHash,
    chunkCount: row.chunkCount,
    lastError: row.lastError,
    updatedAt: row.updatedAt,
  };
}
