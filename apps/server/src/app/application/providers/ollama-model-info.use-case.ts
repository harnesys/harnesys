import { Injectable } from '@harnesys/brix';
import type { DiscoveredModel } from 'harnesys';
import { discoverModelDetails } from 'harnesys';
import { LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { requireProvider } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface OllamaModelInfoRequest {
  orgId: string;
  providerId: string;
  name: string;
}
const OLLAMA_DRIVERS = new Set(['ollama', 'ollama-cloud']);

@Injectable()
export class OllamaModelInfoUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: OllamaModelInfoRequest): Promise<DiscoveredModel> {
    const provider = requireProvider(this.providers, request.orgId, request.providerId);
    if (!OLLAMA_DRIVERS.has(provider.driver)) {
      throw new ProviderValidationException(
        'autofill from Ollama is only available for ollama providers',
      );
    }
    const apiKey = await this.keys.resolveApiKey(request.orgId, provider.id, provider.apiKey);
    const details = await discoverModelDetails(
      {
        driver: provider.driver,
        apiUrl: provider.apiUrl ?? undefined,
        apiKey,
        headers: provider.headers,
      },
      request.name,
    );
    if (!details) {
      throw new ProviderValidationException(`Ollama has no details for model ${request.name}`);
    }
    return details;
  }
}
