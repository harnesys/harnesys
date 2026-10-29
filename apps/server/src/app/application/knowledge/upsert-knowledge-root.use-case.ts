import { Injectable } from '@harnesys/brix';
import type { KnowledgeRootRecord } from '@harnesys/studio-shared';
import {
  KnowledgeSourceNotFoundException,
  KnowledgeValidationException,
} from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface UpsertKnowledgeRootRequest {
  orgId: string;
  sourceId: string;
  path: string;
  enabled?: boolean;
}

@Injectable()
export class UpsertKnowledgeRootUseCase {
  constructor(
    private readonly knowledge: KnowledgeStorePort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: UpsertKnowledgeRootRequest): KnowledgeRootRecord {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      throw new KnowledgeSourceNotFoundException(request.sourceId);
    }
    if (!request.path.trim()) {
      throw new KnowledgeValidationException('path required');
    }
    return this.knowledge.upsertRoot({
      orgId: request.orgId,
      sourceId: request.sourceId,
      path: request.path,
      enabled: request.enabled,
    });
  }
}
