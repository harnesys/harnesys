export type {
  KnowledgeFileRecord,
  KnowledgeFileStatus,
  KnowledgeFilesByStatus,
  KnowledgeIndexState,
  KnowledgeRootRecord,
  KnowledgeSettings,
  KnowledgeStats,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
export type { UpsertKnowledgeRootInput } from './knowledge-store.port.ts';
export { KnowledgeStorePort as KnowledgeRootsPort } from './knowledge-store.port.ts';
