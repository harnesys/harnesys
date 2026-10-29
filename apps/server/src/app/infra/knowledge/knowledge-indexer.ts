import { trace } from '../../libs/trace.ts';
import type { EmbeddingsPort } from './embeddings.ts';
import { embeddingsForSettings } from './knowledge-embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type {
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
} from './knowledge-index-types.ts';
import { runFullReindex } from './knowledge-indexer-full.ts';
import type {
  KnowledgeIndexerHost,
  KnowledgeIndexerOptions,
  ProjectJob,
} from './knowledge-indexer-shared.ts';
import { filterEnqueueUris } from './knowledge-indexer-uri.ts';
import { drainIncremental } from './knowledge-indexer-watch.ts';

export type { KnowledgeIndexerOptions } from './knowledge-indexer-shared.ts';

export class KnowledgeIndexer {
  private readonly jobs = new Map<string, ProjectJob>();
  private embeddings: EmbeddingsPort | undefined;
  constructor(
    private readonly repo: SqliteKnowledgeIndexRepo,
    private readonly options: KnowledgeIndexerOptions,
  ) {
    this.embeddings = options.embeddings;
  }
  setEmbeddings(embeddings: EmbeddingsPort | undefined): void {
    this.embeddings = embeddings;
  }
  private resolveEmbeddings(
    sourceId: string,
    settings: KnowledgeSettingsRecord,
  ): EmbeddingsPort | undefined {
    if (this.options.embeddingsDeps) {
      return embeddingsForSettings(this.options.embeddingsDeps, settings, sourceId);
    }
    return this.embeddings;
  }
  getState(sourceId: string): KnowledgeIndexStateRecord {
    const base = this.repo.getState(sourceId);
    const job = this.jobs.get(sourceId);
    if (job?.currentUri && base.status === 'running') {
      return { ...base, currentUri: job.currentUri } as KnowledgeIndexStateRecord;
    }
    return base;
  }
  listStates(): KnowledgeIndexStateRecord[] {
    return this.repo.listStates().map((row) => this.getState(row.sourceId));
  }
  private emitState(sourceId: string): void {
    if (!this.options.events) {
      return;
    }
    this.options.events.emit(sourceId, this.getState(sourceId));
  }
  private upsertState(
    sourceId: string,
    patch: KnowledgeIndexStatePatch,
  ): KnowledgeIndexStateRecord {
    const next = this.repo.upsertState(sourceId, patch);
    this.options.events?.emit(sourceId, next);
    return next;
  }
  private bumpProcessed(sourceId: string): void {
    this.repo.bumpProcessed(sourceId);
    this.emitState(sourceId);
  }
  cancel(sourceId: string): void {
    const job = this.ensureJob(sourceId);
    job.cancel = true;
    job.currentUri = null;
    job.pendingUris.length = 0;
    job.controller?.abort();
    trace('knowledge-indexer', 'cancel requested', { sourceId });
    const state = this.repo.getState(sourceId);
    if (state.status === 'running') {
      const next = this.repo.upsertState(sourceId, {
        status: 'idle',
        phase: null,
        lastError: 'cancelled',
        finishedAt: new Date().toISOString(),
      });
      this.options.events?.emit(sourceId, next);
    }
  }
  startFullReindex(sourceId: string): Promise<void> {
    trace('knowledge-indexer', 'startFullReindex requested', { sourceId });
    this.upsertState(sourceId, {
      status: 'running',
      phase: 'scan',
      processed: 0,
      total: 0,
      lastError: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    void this.enqueue(sourceId, () => runFullReindex(this.host, sourceId)).catch((err) => {
      trace('knowledge-indexer', 'reindex enqueue error (swallowed)', {
        sourceId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    return Promise.resolve();
  }
  reindexAndWait(sourceId: string): Promise<void> {
    return this.enqueue(sourceId, () => runFullReindex(this.host, sourceId));
  }
  enqueuePaths(sourceId: string, uris: string[]): void {
    if (uris.length === 0) {
      return;
    }
    const projectPath = this.options.resolveProjectPath(sourceId);
    if (!projectPath) {
      trace('knowledge-indexer', 'enqueuePaths: no project path', { sourceId });
      return;
    }
    const settings = this.repo.getSettingsOrDefault(sourceId);
    const roots = settings.entireSource ? null : this.options.listEnabledRoots(sourceId);
    if (roots && roots.length === 0) {
      trace('knowledge-indexer', 'enqueuePaths: no enabled roots', { sourceId });
      return;
    }
    const filtered = filterEnqueueUris(projectPath, uris, roots);
    if (filtered.length === 0) {
      trace('knowledge-indexer', 'enqueuePaths: filtered empty', {
        sourceId,
        uris,
      });
      return;
    }
    const job = this.ensureJob(sourceId);
    let added = 0;
    for (const uri of filtered) {
      if (!job.pendingUris.includes(uri)) {
        job.pendingUris.push(uri);
        added += 1;
      }
    }
    trace('knowledge-indexer', 'enqueuePaths', {
      sourceId,
      uris: filtered,
      added,
      pendingTotal: job.pendingUris.length,
      busy: job.busy,
    });
    void this.enqueue(sourceId, () => drainIncremental(this.host, sourceId));
  }
  private ensureJob(sourceId: string): ProjectJob {
    let job = this.jobs.get(sourceId);
    if (!job) {
      job = {
        cancel: false,
        chain: Promise.resolve(),
        pendingUris: [],
        busy: false,
        currentUri: null,
      };
      this.jobs.set(sourceId, job);
    }
    return job;
  }
  private enqueue(sourceId: string, work: () => Promise<void>): Promise<void> {
    const job = this.ensureJob(sourceId);
    const run = job.chain.then(async () => {
      job.busy = true;
      job.cancel = false;
      job.currentUri = null;
      job.controller = new AbortController();
      try {
        await work();
        if (job.pendingUris.length > 0 && !job.cancel) {
          trace('knowledge-indexer', 'drain incremental after main job', {
            sourceId,
            pending: job.pendingUris.length,
          });
          await drainIncremental(this.host, sourceId, job.controller.signal);
        }
      } finally {
        job.busy = false;
        job.controller = undefined;
        job.currentUri = null;
      }
    });
    job.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
  private get host(): KnowledgeIndexerHost {
    return {
      repo: this.repo,
      options: this.options,
      resolveEmbeddings: (sourceId, settings) => this.resolveEmbeddings(sourceId, settings),
      ensureJob: (sourceId) => this.ensureJob(sourceId),
      upsertState: (sourceId, patch) => this.upsertState(sourceId, patch),
      emitState: (sourceId) => this.emitState(sourceId),
      bumpProcessed: (sourceId) => this.bumpProcessed(sourceId),
    };
  }
}
