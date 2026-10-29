import type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeIndexStatus,
  KnowledgeSettings,
  MemorySearchBackend,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';

export type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexStatus,
  MemorySearchBackend,
  UpsertKnowledgeSettingsRequest,
};
export type KnowledgeSettingsRecord = KnowledgeSettings;
export type KnowledgeIndexStateRecord = KnowledgeIndexState;
export interface KnowledgeIndexStatePatch {
  status?: KnowledgeIndexStatus;
  phase?: string | null;
  processed?: number;
  total?: number;
  lastError?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}
export interface UpsertKnowledgeFileInput {
  sourceId: string;
  uri: string;
  status: KnowledgeFileStatus;
  skipReason?: string | null;
  mtimeMs?: number | null;
  sizeBytes?: number | null;
  contentHash?: string | null;
  chunkCount?: number;
  lastError?: string | null;
  updatedAt: string;
}
