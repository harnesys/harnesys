import type { KnowledgeIndexState } from '@harnesys/studio-shared';

export type KnowledgeIndexStateListener = (state: KnowledgeIndexState) => void;
export type KnowledgeIndexStateAllListener = (sourceId: string, state: KnowledgeIndexState) => void;

export abstract class KnowledgeIndexEventsPort {
  abstract subscribe(sourceId: string, listener: KnowledgeIndexStateListener): () => void;
  abstract subscribeAll(listener: KnowledgeIndexStateAllListener): () => void;
  abstract emit(sourceId: string, state: KnowledgeIndexState): void;
}
