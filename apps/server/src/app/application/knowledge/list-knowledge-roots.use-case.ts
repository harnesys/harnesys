import { Injectable } from '@harnesys/brix';
import type { KnowledgeRootRecord } from '@harnesys/studio-shared';
import { KnowledgeSourceNotFoundException } from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface ListKnowledgeRootsRequest {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class ListKnowledgeRootsUseCase {
  constructor(
    private readonly knowledge: KnowledgeStorePort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: ListKnowledgeRootsRequest): KnowledgeRootRecord[] {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      throw new KnowledgeSourceNotFoundException(request.sourceId);
    }
    return this.knowledge.listRoots(request.orgId, request.sourceId);
  }
}
