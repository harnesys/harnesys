import { Injectable } from '@harnesys/brix';
import type { KnowledgeSettings, UpsertKnowledgeSettingsRequest } from '@harnesys/studio-shared';
import {
  KnowledgeSourceNotFoundException,
  KnowledgeValidationException,
} from '../../domain/knowledge/knowledge.error.ts';
import { KnowledgeStorePort } from '../../domain/knowledge/knowledge-store.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';

export interface PutKnowledgeSettingsRequest extends UpsertKnowledgeSettingsRequest {
  orgId: string;
  sourceId: string;
}

export function validateKnowledgeSettingsPatch(
  request: UpsertKnowledgeSettingsRequest,
  current: KnowledgeSettings,
): void {
  if (request.backend !== undefined && request.backend !== 'fts' && request.backend !== 'vector') {
    throw new KnowledgeValidationException('backend must be "fts" or "vector"');
  }
  const provider =
    request.embedProvider === undefined ? current.embedProvider : request.embedProvider;
  const model = request.embedModel === undefined ? current.embedModel : request.embedModel;
  const providerSet = provider != null && provider.trim() !== '';
  const modelSet = model != null && model.trim() !== '';
  if (providerSet !== modelSet) {
    throw new KnowledgeValidationException(
      'embedProvider and embedModel must both be set or both be null',
    );
  }
  const backend = request.backend ?? current.backend;
  if (backend === 'vector' && (!providerSet || !modelSet)) {
    throw new KnowledgeValidationException(
      'vector backend requires embedProvider and embedModel; set both explicitly',
    );
  }
}

@Injectable()
export class PutKnowledgeSettingsUseCase {
  constructor(
    private readonly knowledge: KnowledgeStorePort,
    private readonly sources: SourceRegistryPort,
  ) {}

  execute(request: PutKnowledgeSettingsRequest): KnowledgeSettings {
    if (!this.sources.findById(request.orgId, request.sourceId)) {
      throw new KnowledgeSourceNotFoundException(request.sourceId);
    }
    const before = this.knowledge.getSettings(request.orgId, request.sourceId);
    validateKnowledgeSettingsPatch(request, before);
    return this.knowledge.putSettings(request.orgId, request.sourceId, request);
  }
}
