import { Injectable } from '@harnesys/brix';
import { type DiscoveredModel, discoverModels } from 'harnesys';
import { LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { requireProvider } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface DiscoverProviderModelsRequest {
  orgId: string;
  id: string;
}

@Injectable()
export class DiscoverProviderModelsUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: DiscoverProviderModelsRequest): Promise<DiscoveredModel[]> {
    const provider = requireProvider(this.providers, request.orgId, request.id);
    const apiKey = await this.keys.resolveApiKey(request.orgId, provider.id, provider.apiKey);
    return discoverModels({
      driver: provider.driver,
      apiUrl: provider.apiUrl ?? undefined,
      apiKey,
      headers: provider.headers,
    });
  }
}
