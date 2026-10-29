import { Injectable } from '@harnesys/brix';
import type { ProviderPublic } from '@harnesys/studio-shared';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { toProviderPublic } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface ListProvidersRequest {
  orgId: string;
}

@Injectable()
export class ListProvidersUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: ListProvidersRequest): Promise<ProviderPublic[]> {
    const allProviders = this.providers.list(request.orgId);
    const result: ProviderPublic[] = [];
    for (const provider of allProviders) {
      const migratedRef = await this.keys.migrateLegacyIfNeeded(
        request.orgId,
        provider.id,
        provider.name,
        provider.apiKey,
      );
      let row = provider;
      if (migratedRef !== provider.apiKey) {
        row = this.providers.update(request.orgId, provider.id, { apiKey: migratedRef });
      }
      const models = this.models.listByProvider(request.orgId, row.id);
      result.push(
        toProviderPublic(
          row,
          models,
          await this.keys.hasSecret(request.orgId, row.id, row.apiKey),
          this.keys.apiKeySecretName(row.apiKey),
        ),
      );
    }
    return result;
  }
}
