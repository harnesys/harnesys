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
import type { KnowledgeReadResult } from 'harnesys';

export interface UpsertKnowledgeRootInput {
  orgId: string;
  sourceId: string;
  path: string;
  enabled?: boolean;
}

export abstract class KnowledgeStorePort {
  abstract listRoots(orgId: string, sourceId: string): KnowledgeRootRecord[];
  abstract upsertRoot(input: UpsertKnowledgeRootInput): KnowledgeRootRecord;
  abstract deleteRoot(orgId: string, sourceId: string, path: string): void;
  abstract countChunks(orgId: string, sourceId: string): number;
  abstract countFilesByStatus(orgId: string, sourceId: string): KnowledgeFilesByStatus;
  abstract getSettings(orgId: string, sourceId: string): KnowledgeSettings;
  abstract putSettings(
    orgId: string,
    sourceId: string,
    patch: UpsertKnowledgeSettingsRequest,
  ): KnowledgeSettings;
  abstract listFiles(
    orgId: string,
    sourceId: string,
    status?: KnowledgeFileStatus,
  ): KnowledgeFileRecord[];
  abstract getIndexState(orgId: string, sourceId: string): KnowledgeIndexState;
  abstract getStats(orgId: string, sourceId: string): KnowledgeStats;
  abstract readChunk(orgId: string, sourceId: string, id: string): KnowledgeReadResult;
  abstract deleteForSource(orgId: string, sourceId: string): void;
}
