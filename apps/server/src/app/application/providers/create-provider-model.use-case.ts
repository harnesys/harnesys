import { Injectable } from '@harnesys/brix';
import type { ProviderModelPublic } from '@harnesys/studio-shared';
import { isModelKind, isModelKindSupported } from 'harnesys';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { requireProvider, toModelPublic } from './provider.helpers.ts';

export interface CreateProviderModelRequest {
  orgId: string;
  providerId: string;
  name: string;
  kind?: string;
  metadata?: unknown;
}

@Injectable()
export class CreateProviderModelUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
  ) {}

  execute(request: CreateProviderModelRequest): ProviderModelPublic {
    const name = request.name?.trim();
    if (!name) {
      throw new ProviderValidationException('model name cannot be empty');
    }
    const kind = request.kind?.trim() || 'chat';
    if (isModelKind(kind) && !isModelKindSupported(kind)) {
      throw new ProviderValidationException(`model kind "${kind}" is not supported yet`);
    }
    const provider = requireProvider(this.providers, request.orgId, request.providerId);
    const now = new Date().toISOString();
    const inserted = this.models.insert(request.orgId, {
      id: crypto.randomUUID(),
      providerId: provider.id,
      name,
      kind,
      metadata: request.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    });
    return toModelPublic(inserted, provider.driver);
  }
}
