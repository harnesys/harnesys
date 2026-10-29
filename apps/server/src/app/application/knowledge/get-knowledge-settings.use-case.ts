import { Injectable } from '@harnesys/brix';
import type { KnowledgeSettings } from '@harnesys/studio-shared';
import { KnowledgeSourceNotFoundException } from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface GetKnowledgeSettingsRequest {
  orgId: string;
  sourceId: string;
}

@Injectable()
export class GetKnowledgeSettingsUseCase {
  constructor(
    private readonly knowledge: KnowledgeStorePort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: GetKnowledgeSettingsRequest): KnowledgeSettings {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      throw new KnowledgeSourceNotFoundException(request.sourceId);
    }
    return this.knowledge.getSettings(request.orgId, request.sourceId);
  }
}
