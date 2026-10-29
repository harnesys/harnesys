import { Injectable } from '@harnesys/brix';
import type { VoiceOption } from '../../domain/model-execution/voice-catalog.port.ts';
import { VoiceCatalogPort } from '../../domain/model-execution/voice-catalog.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { createOrgModelsPort } from '../../infra/runtime/org-models.port.ts';

export interface ResolveVoicesRequest {
  orgId: string;
  provider: string;
  model: string;
}

@Injectable()
export class ResolveVoicesUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly voiceCatalog: VoiceCatalogPort,
  ) {}

  async execute(request: ResolveVoicesRequest): Promise<VoiceOption[]> {
    const binding = await createOrgModelsPort(
      request.orgId,
      this.providers,
      this.models,
      this.secrets,
    ).get(request.provider, request.model);
    return this.voiceCatalog.list(binding);
  }
}
