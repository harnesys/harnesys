import type { KnowledgeIndexState } from '@harnesys/studio-shared';

export abstract class KnowledgeIndexerPort {
  abstract startFullReindex(orgId: string, sourceId: string): Promise<KnowledgeIndexState>;
  abstract cancel(orgId: string, sourceId: string): KnowledgeIndexState;
  abstract getState(orgId: string, sourceId: string): KnowledgeIndexState;
  abstract listIndexStates(orgId: string): KnowledgeIndexState[];
  abstract onFileEvent(orgId: string, sourceId: string, uri: string, removed: boolean): void;
}
