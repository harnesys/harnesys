import { Injectable } from '@harnesys/brix';
import type { ProviderPublic } from '@harnesys/studio-shared';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { requireProvider, toProviderPublic } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface GetProviderRequest {
  orgId: string;
  id: string;
}

@Injectable()
export class GetProviderUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: GetProviderRequest): Promise<ProviderPublic> {
    let provider = requireProvider(this.providers, request.orgId, request.id);
    const migratedRef = await this.keys.migrateLegacyIfNeeded(
      request.orgId,
      provider.id,
      provider.name,
      provider.apiKey,
    );
    if (migratedRef !== provider.apiKey) {
      provider = this.providers.update(request.orgId, provider.id, { apiKey: migratedRef });
    }
    const models = this.models.listByProvider(request.orgId, provider.id);
    return toProviderPublic(
      provider,
      models,
      await this.keys.hasSecret(request.orgId, provider.id, provider.apiKey),
      this.keys.apiKeySecretName(provider.apiKey),
    );
  }
}
