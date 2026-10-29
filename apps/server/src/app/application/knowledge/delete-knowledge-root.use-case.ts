import { Injectable } from '@harnesys/brix';
import {
  KnowledgeSourceNotFoundException,
  KnowledgeValidationException,
} from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface DeleteKnowledgeRootRequest {
  orgId: string;
  sourceId: string;
  path: string;
}

@Injectable()
export class DeleteKnowledgeRootUseCase {
  constructor(
    private readonly knowledge: KnowledgeStorePort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: DeleteKnowledgeRootRequest): void {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      throw new KnowledgeSourceNotFoundException(request.sourceId);
    }
    if (!request.path.trim()) {
      throw new KnowledgeValidationException('path required');
    }
    this.knowledge.deleteRoot(request.orgId, request.sourceId, request.path);
  }
}
