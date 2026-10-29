import { KNOWLEDGE_INDEX_SLOW_FILE_MS } from '../../../const.ts';
import {
  KnowledgeSourceNotFoundException,
  KnowledgeValidationException,
} from '../../domain/knowledge/knowledge.error.ts';
import { trace } from '../../libs/trace.ts';
import { knowledgeIndexModeKey } from './knowledge-embeddings.ts';
import { indexKnowledgeFile, upsertWalkEntry } from './knowledge-index-file.ts';
import { isAbortError, type KnowledgeIndexerHost } from './knowledge-indexer-shared.ts';
import { collectKnowledgePaths, type KnowledgePath } from './knowledge-walk.ts';

export async function runFullReindex(host: KnowledgeIndexerHost, sourceId: string): Promise<void> {
  const projectPath = host.options.resolveProjectPath(sourceId);
  if (!projectPath) {
    throw new KnowledgeSourceNotFoundException('project not found');
  }
  const settings = host.repo.getSettingsOrDefault(sourceId);
  const wantVector = settings.backend === 'vector';
  const embeddings = host.resolveEmbeddings(sourceId, settings);
  if (wantVector && !embeddings?.available()) {
    const message =
      'knowledge vector backend needs an embeddings model; use backend "fts" or configure embed model';
    host.upsertState(sourceId, {
      status: 'error',
      phase: null,
      lastError: message,
      finishedAt: new Date().toISOString(),
    });
    throw new KnowledgeValidationException(message);
  }
  const startedAt = new Date().toISOString();
  host.upsertState(sourceId, {
    status: 'running',
    phase: 'scan',
    processed: 0,
    total: 0,
    lastError: null,
    startedAt,
    finishedAt: null,
  });
  const job = host.ensureJob(sourceId);
  const signal = job.controller?.signal;
  trace('knowledge-indexer', 'runFullReindex start', {
    sourceId,
    backend: settings.backend,
    embedProvider: settings.embedProvider,
    embedModel: settings.embedModel,
    entireSource: settings.entireSource,
    wantVector,
    embeddingsAvailable: embeddings?.available() ?? false,
  });
  try {
    const roots = settings.entireSource ? ['.'] : host.options.listEnabledRoots(sourceId);
    if (!settings.entireSource && roots.length === 0) {
      host.upsertState(sourceId, {
        status: 'idle',
        phase: null,
        processed: 0,
        total: 0,
        lastError: null,
        finishedAt: new Date().toISOString(),
      });
      return;
    }
    const seen = new Set<string>();
    const indexable: Array<
      Extract<
        KnowledgePath,
        {
          kind: 'index';
        }
      >
    > = [];
    const indexModeKey = knowledgeIndexModeKey(settings);
    for (const root of roots) {
      if (job.cancel) {
        trace('knowledge-indexer', 'scan cancelled', { sourceId, root });
        break;
      }
      const t0 = Date.now();
      const entries = await collectKnowledgePaths(projectPath, root);
      const now = new Date().toISOString();
      let scannedIndex = 0;
      let scannedSkip = 0;
      for (const entry of entries) {
        seen.add(entry.uri);
        upsertWalkEntry(host.repo, sourceId, entry, now);
        if (entry.kind === 'index') {
          indexable.push(entry);
          scannedIndex += 1;
        } else {
          scannedSkip += 1;
        }
      }
      trace('knowledge-indexer', 'scan root done', {
        sourceId,
        root,
        entries: entries.length,
        indexable: scannedIndex,
        skipped: scannedSkip,
        elapsedMs: Date.now() - t0,
      });
    }
    trace('knowledge-indexer', 'scan phase done', {
      sourceId,
      totalFiles: indexable.length,
      skippedParents: seen.size - indexable.length,
    });
    host.upsertState(sourceId, { phase: 'index', total: indexable.length, processed: 0 });
    trace('knowledge-indexer', 'index phase start', {
      sourceId,
      total: indexable.length,
    });
    for (let idx = 0; idx < indexable.length; idx += 1) {
      const entry = indexable[idx];
      if (!entry) {
        continue;
      }
      if (job.cancel || signal?.aborted) {
        trace('knowledge-indexer', 'index loop aborted', {
          sourceId,
          processed: idx,
        });
        break;
      }
      job.currentUri = entry.uri;
      host.emitState(sourceId);
      const fileStart = Date.now();
      trace('knowledge-indexer', 'index file start', {
        sourceId,
        uri: entry.uri,
        sizeBytes: entry.sizeBytes,
        index: `${idx + 1}/${indexable.length}`,
      });
      let result: string;
      try {
        result = await indexKnowledgeFile({
          repo: host.repo,
          sourceId,
          entry,
          wantVector,
          embeddings,
          updatedAt: new Date().toISOString(),
          indexModeKey,
          force: true,
          signal,
        });
      } catch (err) {
        if (isAbortError(err)) {
          trace('knowledge-indexer', 'index file aborted', {
            sourceId,
            uri: entry.uri,
            elapsedMs: Date.now() - fileStart,
          });
          break;
        }
        throw err;
      }
      const elapsed = Date.now() - fileStart;
      trace('knowledge-indexer', 'index file done', {
        sourceId,
        uri: entry.uri,
        result,
        elapsedMs: elapsed,
        slow:
          elapsed > KNOWLEDGE_INDEX_SLOW_FILE_MS
            ? 'SLOW (>5s) - check Ollama keep_alive / model load'
            : false,
      });
      job.currentUri = null;
      host.bumpProcessed(sourceId);
    }
    if (!job.cancel && !signal?.aborted) {
      host.repo.deleteMissingFiles(sourceId, seen);
      host.repo.deleteOrphanChunks(sourceId, seen);
    }
    const cur = host.repo.getState(sourceId);
    if (cur.status === 'running' || job.cancel || signal?.aborted) {
      host.upsertState(sourceId, {
        status: 'idle',
        phase: null,
        lastError: job.cancel || signal?.aborted ? 'cancelled' : null,
        finishedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    if (isAbortError(err)) {
      trace('knowledge-indexer', 'runFullReindex aborted', { sourceId });
      host.upsertState(sourceId, {
        status: 'idle',
        phase: null,
        lastError: 'cancelled',
        finishedAt: new Date().toISOString(),
      });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    trace('knowledge-indexer', 'runFullReindex error', {
      sourceId,
      error: message.slice(0, 500),
    });
    host.upsertState(sourceId, {
      status: 'error',
      phase: null,
      lastError: message.slice(0, 500),
      finishedAt: new Date().toISOString(),
    });
    throw err;
  } finally {
    job.currentUri = null;
  }
}
