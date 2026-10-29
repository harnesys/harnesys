import { Injectable } from '@harnesys/brix';
import type { KnowledgeHit } from 'harnesys';
import { KnowledgeSourceNotFoundException } from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeSearchPort } from '../../domain/knowledge/knowledge-search.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface SearchKnowledgeRequest {
  orgId: string;
  sourceId: string;
  query: string;
  limit?: number;
}

@Injectable()
export class SearchKnowledgeUseCase {
  constructor(
    private readonly search: KnowledgeSearchPort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: SearchKnowledgeRequest): Promise<KnowledgeHit[]> {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      return Promise.reject(new KnowledgeSourceNotFoundException(request.sourceId));
    }
    return this.search.search(request.orgId, request.sourceId, request.query, request.limit);
  }
}
