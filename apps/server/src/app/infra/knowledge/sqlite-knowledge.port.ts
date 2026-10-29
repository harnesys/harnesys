import { and, count, eq } from 'drizzle-orm';
import type {
  KnowledgeHit,
  KnowledgePort,
  KnowledgeReadInput,
  KnowledgeReadResult,
  KnowledgeReindexInput,
  KnowledgeSearchInput,
} from 'harnesys';
import {
  KnowledgeSourceNotFoundException,
  KnowledgeValidationException,
} from '../../domain/knowledge/knowledge.error.ts';
import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  UpsertKnowledgeSettingsRequest,
} from '../../domain/knowledge/knowledge-roots.port.ts';
import type { OrgSqliteDb } from '../org-sqlite/org-sqlite-session.ts';
import {
  type KnowledgeRootRow,
  knowledgeChunksTable,
  knowledgeRootsTable,
} from '../org-sqlite/schema/index.ts';
import type { EmbeddingsPort, StudioEmbeddingsDeps } from './embeddings.ts';
import { embeddingsForSettings } from './knowledge-embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type { KnowledgeIndexer } from './knowledge-indexer.ts';
import { searchKnowledgeFts, searchKnowledgeVector } from './knowledge-search.ts';
import type { MemorySearchBackend } from './memory-backend.ts';

interface LocalUpsertRoot {
  sourceId: string;
  path: string;
  enabled?: boolean;
}
export interface SqliteKnowledgePortOptions {
  backend?: MemorySearchBackend;
  embeddings?: EmbeddingsPort;
  embeddingsDeps?: StudioEmbeddingsDeps;
  topK?: number;
  resolveProjectPath: (sourceId: string) => string | undefined;
  indexRepo?: SqliteKnowledgeIndexRepo;
  indexer?: KnowledgeIndexer;
}
export class SqliteKnowledgePort implements KnowledgePort {
  private backend: MemorySearchBackend;
  private embeddings: EmbeddingsPort | undefined;
  private topK: number;
  private indexRepo: SqliteKnowledgeIndexRepo | undefined;
  private indexer: KnowledgeIndexer | undefined;
  constructor(
    private readonly db: OrgSqliteDb,
    private readonly options: SqliteKnowledgePortOptions,
  ) {
    this.backend = options.backend ?? 'fts';
    this.embeddings = options.embeddings;
    this.topK = options.topK ?? 5;
    this.indexRepo = options.indexRepo;
    this.indexer = options.indexer;
  }
  setBackend(backend: MemorySearchBackend): void {
    this.backend = backend;
  }
  setEmbeddings(embeddings: EmbeddingsPort | undefined): void {
    this.embeddings = embeddings;
    this.indexer?.setEmbeddings(embeddings);
  }
  setIndexer(indexer: KnowledgeIndexer, indexRepo?: SqliteKnowledgeIndexRepo): void {
    this.indexer = indexer;
    if (indexRepo) {
      this.indexRepo = indexRepo;
    }
  }
  getSettings(sourceId: string): KnowledgeSettings {
    return this.requireIndexRepo().getSettingsOrDefault(sourceId);
  }
  putSettings(sourceId: string, patch: UpsertKnowledgeSettingsRequest): KnowledgeSettings {
    return this.requireIndexRepo().putSettings(sourceId, patch);
  }
  getIndexState(sourceId: string): KnowledgeIndexState {
    return this.indexer?.getState(sourceId) ?? this.requireIndexRepo().getState(sourceId);
  }
  listFiles(sourceId: string, status?: KnowledgeFileStatus): KnowledgeFileRecord[] {
    return this.requireIndexRepo().listFiles(sourceId, status);
  }
  countFilesByStatus(sourceId: string): KnowledgeFilesByStatus {
    return this.requireIndexRepo().countFilesByStatus(sourceId);
  }
  async startReindex(sourceId: string): Promise<KnowledgeIndexState> {
    const indexer = this.requireIndexerAndPath(sourceId);
    this.applyProjectBackend(sourceId);
    await indexer.startFullReindex(sourceId);
    return this.getIndexState(sourceId);
  }
  cancelIndex(sourceId: string): KnowledgeIndexState {
    const indexer = this.requireIndexerAndPath(sourceId);
    indexer.cancel(sourceId);
    return this.getIndexState(sourceId);
  }
  listRoots(sourceId: string): KnowledgeRootRecord[] {
    return this.db
      .select()
      .from(knowledgeRootsTable)
      .where(eq(knowledgeRootsTable.sourceId, sourceId))
      .all()
      .map(toRootRecord);
  }
  upsertRoot(input: LocalUpsertRoot): KnowledgeRootRecord {
    const enabled = input.enabled ?? true;
    const existing = this.db
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
      const row = this.db
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
      return toRootRecord(row);
    }
    const row = this.db
      .insert(knowledgeRootsTable)
      .values({ sourceId: input.sourceId, path: input.path, enabled })
      .returning()
      .get();
    return toRootRecord(row);
  }
  deleteRoot(sourceId: string, path: string): void {
    this.db
      .delete(knowledgeRootsTable)
      .where(and(eq(knowledgeRootsTable.sourceId, sourceId), eq(knowledgeRootsTable.path, path)))
      .run();
  }
  countChunks(sourceId: string): number {
    const row = this.db
      .select({ value: count() })
      .from(knowledgeChunksTable)
      .where(eq(knowledgeChunksTable.sourceId, sourceId))
      .get();
    return row?.value ?? 0;
  }
  search(input: KnowledgeSearchInput): Promise<KnowledgeHit[]> {
    const limit = input.limit ?? this.topK;
    const backend = this.applyProjectBackend(input.sourceId);
    if (backend === 'vector') {
      return searchKnowledgeVector({
        db: this.db,
        sourceId: input.sourceId,
        query: input.query,
        limit,
        embeddings: this.resolveEmbeddings(input.sourceId),
      });
    }
    return Promise.resolve(searchKnowledgeFts(this.db, input.sourceId, input.query, limit));
  }
  read(input: KnowledgeReadInput): Promise<KnowledgeReadResult> {
    const row = this.db
      .select()
      .from(knowledgeChunksTable)
      .where(
        and(
          eq(knowledgeChunksTable.id, input.id),
          eq(knowledgeChunksTable.sourceId, input.sourceId),
        ),
      )
      .get();
    if (!row) {
      return Promise.reject(new KnowledgeSourceNotFoundException('knowledge chunk not found'));
    }
    return Promise.resolve({
      id: row.id,
      text: row.text,
      ...(row.uri ? { uri: row.uri } : {}),
    });
  }
  async reindex(input: KnowledgeReindexInput): Promise<void> {
    const indexer = this.requireIndexerAndPath(input.sourceId);
    this.applyProjectBackend(input.sourceId);
    await indexer.reindexAndWait(input.sourceId);
  }
  private applyProjectBackend(sourceId: string): MemorySearchBackend {
    const settings = this.indexRepo?.getSettingsOrDefault(sourceId);
    const backend = settings?.backend ?? this.backend;
    this.setBackend(backend);
    return backend;
  }
  private resolveEmbeddings(sourceId: string): EmbeddingsPort | undefined {
    const settings = this.indexRepo?.getSettingsOrDefault(sourceId);
    if (settings && this.options.embeddingsDeps) {
      return embeddingsForSettings(this.options.embeddingsDeps, settings, sourceId);
    }
    return this.embeddings;
  }
  private requireIndexRepo(): SqliteKnowledgeIndexRepo {
    if (!this.indexRepo) {
      throw new KnowledgeValidationException('knowledge index repo is not configured');
    }
    return this.indexRepo;
  }
  private requireIndexerAndPath(sourceId: string): KnowledgeIndexer {
    if (!this.indexer) {
      throw new KnowledgeValidationException('knowledge indexer is not configured');
    }
    if (!this.options.resolveProjectPath(sourceId)) {
      throw new KnowledgeSourceNotFoundException('project not found');
    }
    return this.indexer;
  }
}
function toRootRecord(row: KnowledgeRootRow): KnowledgeRootRecord {
  return { sourceId: row.sourceId, path: row.path, enabled: row.enabled };
}
