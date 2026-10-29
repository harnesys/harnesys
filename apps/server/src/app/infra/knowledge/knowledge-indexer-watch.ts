import { trace } from '../../libs/trace.ts';
import { knowledgeIndexModeKey } from './knowledge-embeddings.ts';
import { isAbortError, type KnowledgeIndexerHost } from './knowledge-indexer-shared.ts';
import { indexOneUri } from './knowledge-indexer-uri.ts';
import { uriUnderEnabledRoots } from './knowledge-walk-ignore.ts';

export async function drainIncremental(
  host: KnowledgeIndexerHost,
  sourceId: string,
  signal?: AbortSignal,
): Promise<void> {
  const job = host.ensureJob(sourceId);
  const projectPath = host.options.resolveProjectPath(sourceId);
  if (!projectPath) {
    job.pendingUris.length = 0;
    return;
  }
  const settings = host.repo.getSettingsOrDefault(sourceId);
  const wantVector = settings.backend === 'vector';
  const embeddings = host.resolveEmbeddings(sourceId, settings);
  if (wantVector && !embeddings?.available()) {
    trace('knowledge-indexer', 'skip incremental: embeddings unavailable', { sourceId });
    job.pendingUris.length = 0;
    return;
  }
  const roots = settings.entireSource ? null : host.options.listEnabledRoots(sourceId);
  const indexModeKey = knowledgeIndexModeKey(settings);
  const cur = host.repo.getState(sourceId);
  if (cur.status !== 'running') {
    const byStatus = host.repo.countFilesByStatus(sourceId);
    const actualCurrentTotal = byStatus.indexed + byStatus.pending;
    let newTotal = actualCurrentTotal;
    const pendingSnapshot = [...job.pendingUris];
    for (const uri of pendingSnapshot) {
      const inDb = !!host.repo.getFile(sourceId, uri);
      if (!inDb) {
        newTotal += 1;
      }
    }
    const startProcessed = Math.max(0, newTotal - pendingSnapshot.length);
    host.upsertState(sourceId, {
      status: 'running',
      phase: 'watch',
      total: newTotal,
      processed: startProcessed,
      lastError: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    });
    trace('knowledge-indexer', 'drainIncremental start (visible)', {
      sourceId,
      pending: pendingSnapshot.length,
      actualCurrentTotal,
      newTotal,
      startProcessed,
      backend: settings.backend,
    });
  } else {
    host.upsertState(sourceId, {
      total: cur.total + job.pendingUris.length,
    });
  }
  let processedInBatch = 0;
  while (job.pendingUris.length > 0 && !job.cancel && !signal?.aborted) {
    const uri = job.pendingUris.shift();
    if (!uri) {
      continue;
    }
    if (roots && !uriUnderEnabledRoots(uri, roots)) {
      trace('knowledge-indexer', 'skip uri outside roots', { sourceId, uri });
      continue;
    }
    job.currentUri = uri;
    host.emitState(sourceId);
    trace('knowledge-indexer', 'incremental file start', { sourceId, uri });
    const t0 = Date.now();
    try {
      await indexOneUri({
        repo: host.repo,
        sourceId,
        projectPath,
        uri,
        wantVector,
        embeddings,
        indexModeKey,
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) {
        trace('knowledge-indexer', 'incremental aborted', { sourceId, uri });
        break;
      }
      throw err;
    }
    trace('knowledge-indexer', 'incremental file done', {
      sourceId,
      uri,
      elapsedMs: Date.now() - t0,
    });
    job.currentUri = null;
    host.bumpProcessed(sourceId);
    processedInBatch += 1;
  }
  const after = host.repo.getState(sourceId);
  if (after.status === 'running' && after.phase === 'watch' && job.pendingUris.length === 0) {
    if (!job.cancel && !signal?.aborted) {
      const byStatus = host.repo.countFilesByStatus(sourceId);
      const actualTotal = byStatus.indexed + byStatus.pending;
      host.upsertState(sourceId, {
        status: 'idle',
        phase: null,
        total: actualTotal,
        processed: actualTotal,
        lastError: null,
        finishedAt: new Date().toISOString(),
      });
      trace('knowledge-indexer', 'drainIncremental idle', {
        sourceId,
        processedInBatch,
        actualTotal,
      });
    }
  }
  job.currentUri = null;
}
