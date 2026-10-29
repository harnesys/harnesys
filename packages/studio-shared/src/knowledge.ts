export type MemorySearchBackend = 'fts' | 'vector';
export type KnowledgeFileStatus = 'pending' | 'indexed' | 'skipped' | 'error';
export type KnowledgeIndexStatus = 'idle' | 'running' | 'error';
export interface KnowledgeRootRecord {
  sourceId: string;
  path: string;
  enabled: boolean;
}
export interface KnowledgeSettings {
  sourceId: string;
  entireSource: boolean;
  backend: MemorySearchBackend;
  embedProvider: string | null;
  embedModel: string | null;
  watchEnabled: boolean;
  updatedAt: string;
}
export interface UpsertKnowledgeSettingsRequest {
  entireSource?: boolean;
  backend?: MemorySearchBackend;
  embedProvider?: string | null;
  embedModel?: string | null;
  watchEnabled?: boolean;
}
export interface KnowledgeFileRecord {
  sourceId: string;
  uri: string;
  status: KnowledgeFileStatus;
  skipReason: string | null;
  mtimeMs: number | null;
  sizeBytes: number | null;
  contentHash: string | null;
  chunkCount: number;
  lastError: string | null;
  updatedAt: string;
}
export interface KnowledgeIndexState {
  sourceId: string;
  status: KnowledgeIndexStatus;
  phase: string | null;
  processed: number;
  total: number;
  lastError: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  currentUri?: string | null;
}
export interface KnowledgeFilesByStatus {
  pending: number;
  indexed: number;
  skipped: number;
  error: number;
}
export interface KnowledgeStats {
  chunkCount: number;
  filesByStatus: KnowledgeFilesByStatus;
}
export interface UpsertKnowledgeRootRequest {
  path: string;
  enabled?: boolean;
}
