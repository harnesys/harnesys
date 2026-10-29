import { Injectable } from '@harnesys/brix';
import type { ProviderModelPublic } from '@harnesys/studio-shared';
import { isModelKind, isModelKindSupported } from 'harnesys';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { requireModel, requireProvider, toModelPublic } from './provider.helpers.ts';

export interface UpdateProviderModelRequest {
  orgId: string;
  providerId: string;
  modelId: string;
  name?: string;
  kind?: string;
  metadata?: unknown;
}

@Injectable()
export class UpdateProviderModelUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
  ) {}

  execute(request: UpdateProviderModelRequest): ProviderModelPublic {
    const provider = requireProvider(this.providers, request.orgId, request.providerId);
    requireModel(this.models, request.orgId, request.providerId, request.modelId);
    const patch: { name?: string; kind?: string; metadata?: unknown } = {};
    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ProviderValidationException('model name cannot be empty');
      }
      patch.name = name;
    }
    if (request.kind !== undefined) {
      const kind = request.kind.trim() || 'chat';
      if (isModelKind(kind) && !isModelKindSupported(kind)) {
        throw new ProviderValidationException(`model kind "${kind}" is not supported yet`);
      }
      patch.kind = kind;
    }
    if (request.metadata !== undefined) {
      patch.metadata = request.metadata;
    }
    const updated = this.models.update(request.orgId, request.modelId, patch);
    return toModelPublic(updated, provider.driver);
  }
}
