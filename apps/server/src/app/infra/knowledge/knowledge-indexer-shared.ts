import type { KnowledgeIndexEventsPort } from '../../domain/knowledge/knowledge-index-events.port.ts';
import type { EmbeddingsPort, StudioEmbeddingsDeps } from './embeddings.ts';
import type { SqliteKnowledgeIndexRepo } from './knowledge-index-repo.ts';
import type {
  KnowledgeIndexStatePatch,
  KnowledgeIndexStateRecord,
  KnowledgeSettingsRecord,
} from './knowledge-index-types.ts';

export interface KnowledgeIndexerOptions {
  resolveProjectPath: (sourceId: string) => string | undefined;
  listEnabledRoots: (sourceId: string) => string[];
  embeddings?: EmbeddingsPort;
  embeddingsDeps?: StudioEmbeddingsDeps;
  events?: KnowledgeIndexEventsPort;
}
export interface ProjectJob {
  cancel: boolean;
  chain: Promise<void>;
  pendingUris: string[];
  busy: boolean;
  currentUri: string | null;
  controller?: AbortController;
}
export interface KnowledgeIndexerHost {
  repo: SqliteKnowledgeIndexRepo;
  options: KnowledgeIndexerOptions;
  resolveEmbeddings(
    sourceId: string,
    settings: KnowledgeSettingsRecord,
  ): EmbeddingsPort | undefined;
  ensureJob(sourceId: string): ProjectJob;
  upsertState(sourceId: string, patch: KnowledgeIndexStatePatch): KnowledgeIndexStateRecord;
  emitState(sourceId: string): void;
  bumpProcessed(sourceId: string): void;
}
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError')
  );
}
