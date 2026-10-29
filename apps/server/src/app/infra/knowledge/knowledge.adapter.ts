import { Injectable } from '@harnesys/brix';
import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
import type { KnowledgeHit, KnowledgeReadResult } from 'harnesys';
import { FilesWatcherPort } from '../../domain/knowledge/files-watcher.port.ts';
import { KnowledgeIndexEventsPort } from '../../domain/knowledge/knowledge-index-events.port.ts';
import { KnowledgeIndexerPort } from '../../domain/knowledge/knowledge-indexer.port.ts';
import { KnowledgeSearchPort } from '../../domain/knowledge/knowledge-search.port.ts';
import {
  KnowledgeStorePort,
  type UpsertKnowledgeRootInput,
} from '../../domain/knowledge/knowledge-store.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { resolveProviderApiKey } from '../../domain/secret/provider-api-key.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { trace } from '../../libs/trace.ts';
import {
  type OrgSqliteSession,
  openOrgSqlite,
  withOrgSqlite,
  withOrgSqliteAsync,
} from '../org-sqlite/org-sqlite-session.ts';
import { StudioEmbeddings } from './embeddings.ts';
import { deleteKnowledgeForSource } from './knowledge-delete.ts';
import { modelRefFromSettings } from './knowledge-embeddings.ts';
import { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import { KnowledgeIndexer } from './knowledge-indexer.ts';
import {
  countKnowledgeChunks,
  deleteKnowledgeRoot,
  listKnowledgeRoots,
  readKnowledgeChunk,
  upsertKnowledgeRoot,
} from './knowledge-root-store.ts';
import { searchKnowledgeFts, searchKnowledgeVector } from './knowledge-search.ts';
import { KnowledgeSourceWatch } from './knowledge-source-watch.ts';

interface OrgRuntime {
  session: OrgSqliteSession;
  indexRepo: SqliteKnowledgeIndexRepo;
  indexer: KnowledgeIndexer;
  embeddings: StudioEmbeddings;
  refCount: number;
}

@Injectable()
export class KnowledgeAdapter
  extends KnowledgeStorePort
  implements KnowledgeIndexerPort, KnowledgeSearchPort
{
  private readonly runtimes = new Map<string, OrgRuntime>();
  private readonly sourceWatch: KnowledgeSourceWatch;

  constructor(
    private readonly layout: HostFsLayoutPort,
    private readonly sourceLocation: SourceLocationPort,
    private readonly machine: MachineConfigPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly events: KnowledgeIndexEventsPort,
    filesWatcher: FilesWatcherPort,
  ) {
    super();
    this.sourceWatch = new KnowledgeSourceWatch(filesWatcher);
  }

  private embeddingsDeps(orgId: string, modelRef?: { provider: string; model: string }) {
    return {
      providers: this.providers,
      models: this.models,
      orgId,
      modelRef,
      resolveApiKey: (provider: { id: string; apiKey: string | null }) =>
        resolveProviderApiKey(this.secrets, orgId, provider.id, provider.apiKey),
    };
  }

  listRoots(orgId: string, sourceId: string): KnowledgeRootRecord[] {
    return withOrgSqlite(this.layout, orgId, (db) => listKnowledgeRoots(db, sourceId));
  }

  upsertRoot(input: UpsertKnowledgeRootInput): KnowledgeRootRecord {
    return withOrgSqlite(this.layout, input.orgId, (db) => upsertKnowledgeRoot(db, input));
  }

  deleteRoot(orgId: string, sourceId: string, path: string): void {
    withOrgSqlite(this.layout, orgId, (db) => deleteKnowledgeRoot(db, sourceId, path));
  }

  countChunks(orgId: string, sourceId: string): number {
    return withOrgSqlite(this.layout, orgId, (db) => countKnowledgeChunks(db, sourceId));
  }

  countFilesByStatus(orgId: string, sourceId: string): KnowledgeFilesByStatus {
    return this.withIndexRepo(orgId, (repo) => repo.countFilesByStatus(sourceId));
  }

  getSettings(orgId: string, sourceId: string): KnowledgeSettings {
    return this.withIndexRepo(orgId, (repo) => repo.getSettingsOrDefault(sourceId));
  }

  putSettings(
    orgId: string,
    sourceId: string,
    patch: UpsertKnowledgeSettingsRequest,
  ): KnowledgeSettings {
    const settings = this.withIndexRepo(orgId, (repo) => repo.putSettings(sourceId, patch));
    this.syncSourceWatch(orgId, sourceId, settings.watchEnabled);
    return settings;
  }

  listFiles(orgId: string, sourceId: string, status?: KnowledgeFileStatus): KnowledgeFileRecord[] {
    return this.withIndexRepo(orgId, (repo) => repo.listFiles(sourceId, status));
  }

  getIndexState(orgId: string, sourceId: string): KnowledgeIndexState {
    const runtime = this.runtimes.get(orgId);
    if (runtime) {
      return runtime.indexer.getState(sourceId);
    }
    return this.withIndexRepo(orgId, (repo) => repo.getState(sourceId));
  }

  getStats(orgId: string, sourceId: string): KnowledgeStats {
    return {
      chunkCount: this.countChunks(orgId, sourceId),
      filesByStatus: this.countFilesByStatus(orgId, sourceId),
    };
  }

  readChunk(orgId: string, sourceId: string, id: string): KnowledgeReadResult {
    return withOrgSqlite(this.layout, orgId, (db) => readKnowledgeChunk(db, sourceId, id));
  }

  deleteForSource(orgId: string, sourceId: string): void {
    this.sourceWatch.stopSource(orgId, sourceId);
    withOrgSqlite(this.layout, orgId, (db) => {
      deleteKnowledgeForSource(db, sourceId);
    });
  }

  async startFullReindex(orgId: string, sourceId: string): Promise<KnowledgeIndexState> {
    const runtime = this.acquire(orgId);
    try {
      await runtime.indexer.startFullReindex(sourceId);
      return runtime.indexer.getState(sourceId);
    } finally {
      this.release(orgId);
    }
  }

  cancel(orgId: string, sourceId: string): KnowledgeIndexState {
    const runtime = this.acquire(orgId);
    try {
      runtime.indexer.cancel(sourceId);
      return runtime.indexer.getState(sourceId);
    } finally {
      this.release(orgId);
    }
  }

  getState(orgId: string, sourceId: string): KnowledgeIndexState {
    return this.getIndexState(orgId, sourceId);
  }

  listIndexStates(orgId: string): KnowledgeIndexState[] {
    const runtime = this.runtimes.get(orgId);
    if (runtime) {
      return runtime.indexer.listStates();
    }
    return this.withIndexRepo(orgId, (repo) => repo.listStates());
  }

  onFileEvent(orgId: string, sourceId: string, uri: string, removed: boolean): void {
    const runtime = this.acquire(orgId);
    try {
      if (removed) {
        runtime.indexRepo.deleteFileAndChunks(sourceId, uri);
        return;
      }
      runtime.indexer.enqueuePaths(sourceId, [uri]);
    } finally {
      this.release(orgId);
    }
  }

  private syncSourceWatch(orgId: string, sourceId: string, watchEnabled: boolean): void {
    this.sourceWatch.sync({
      orgId,
      sourceId,
      contentRoot: this.resolveContentRoot(orgId, sourceId),
      watchEnabled,
      onEvent: (eventOrgId, eventSourceId, uri, removed) => {
        this.onFileEvent(eventOrgId, eventSourceId, uri, removed);
      },
    });
  }

  private resolveContentRoot(orgId: string, sourceId: string): string | undefined {
    try {
      return this.sourceLocation.resolve({
        orgId,
        sourceId,
        hostId: this.machine.get().id,
      }).absoluteRoot;
    } catch (err) {
      trace('knowledge', 'content root unresolved', {
        orgId,
        sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  search(orgId: string, sourceId: string, query: string, limit = 5): Promise<KnowledgeHit[]> {
    return withOrgSqliteAsync(this.layout, orgId, async (db) => {
      const repo = new SqliteKnowledgeIndexRepo(db);
      const settings = repo.getSettingsOrDefault(sourceId);
      if (settings.backend === 'vector') {
        const embeddings = new StudioEmbeddings(
          this.embeddingsDeps(orgId, modelRefFromSettings(settings)),
        );
        return searchKnowledgeVector({
          db,
          sourceId,
          query,
          limit,
          embeddings,
        });
      }
      return searchKnowledgeFts(db, sourceId, query, limit);
    });
  }

  private withIndexRepo<T>(orgId: string, fn: (repo: SqliteKnowledgeIndexRepo) => T): T {
    return withOrgSqlite(this.layout, orgId, (db) => fn(new SqliteKnowledgeIndexRepo(db)));
  }

  private acquire(orgId: string): OrgRuntime {
    const existing = this.runtimes.get(orgId);
    if (existing) {
      existing.refCount += 1;
      return existing;
    }
    const session = openOrgSqlite(this.layout, orgId);
    const indexRepo = new SqliteKnowledgeIndexRepo(session.db);
    const embeddings = new StudioEmbeddings(this.embeddingsDeps(orgId));
    const embeddingsDeps = this.embeddingsDeps(orgId);
    const indexer = new KnowledgeIndexer(indexRepo, {
      resolveProjectPath: (sourceId) => {
        return this.resolveContentRoot(orgId, sourceId);
      },
      listEnabledRoots: (sourceId) => {
        const settings = indexRepo.getSettingsOrDefault(sourceId);
        if (settings.entireSource) {
          return ['.'];
        }
        return this.listRoots(orgId, sourceId)
          .filter((root) => root.enabled)
          .map((root) => root.path);
      },
      embeddings,
      embeddingsDeps,
      events: this.events,
    });
    const runtime: OrgRuntime = {
      session,
      indexRepo,
      indexer,
      embeddings,
      refCount: 1,
    };
    this.runtimes.set(orgId, runtime);
    return runtime;
  }

  private release(orgId: string): void {
    const runtime = this.runtimes.get(orgId);
    if (!runtime) {
      return;
    }
    runtime.refCount -= 1;
    if (runtime.refCount <= 0) {
      const busy = false;
      if (!busy) {
        // leave session open for subsequent ops in process; GC on process exit
      }
    }
  }
}
