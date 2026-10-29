import { Injectable } from '@harnesys/brix';
import type { KnowledgeIndexState } from '@harnesys/studio-shared';
import { KnowledgeIndexerPort } from '../../domain/knowledge/knowledge-indexer.port.ts';

export interface ListKnowledgeIndexStatesRequest {
  orgId: string;
}

@Injectable()
export class ListKnowledgeIndexStatesUseCase {
  constructor(private readonly indexer: KnowledgeIndexerPort) {}

  execute(request: ListKnowledgeIndexStatesRequest): KnowledgeIndexState[] {
    return this.indexer.listIndexStates(request.orgId);
  }
}
