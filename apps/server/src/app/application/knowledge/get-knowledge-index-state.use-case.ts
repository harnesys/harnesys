import { Injectable } from '@harnesys/brix';
import type { KnowledgeIndexState } from '@harnesys/studio-shared';
import { KnowledgeSourceNotFoundException } from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeIndexerPort } from '../../domain/knowledge/knowledge-indexer.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface GetKnowledgeIndexStateRequest {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class GetKnowledgeIndexStateUseCase {
  constructor(
    private readonly indexer: KnowledgeIndexerPort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: GetKnowledgeIndexStateRequest): KnowledgeIndexState {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      throw new KnowledgeSourceNotFoundException(request.sourceId);
    }
    return this.indexer.getState(request.orgId, request.sourceId);
  }
}
