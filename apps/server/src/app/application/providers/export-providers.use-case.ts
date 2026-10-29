import { Injectable } from '@harnesys/brix';
import type { Driver, ProviderExportBundle } from '@harnesys/studio-shared';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface ExportProvidersRequest {
  orgId: string;
}

@Injectable()
export class ExportProvidersUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: ExportProvidersRequest): Promise<ProviderExportBundle> {
    const providers = this.providers.list(request.orgId);
    const entries = [];
    for (const provider of providers) {
      const migratedRef = await this.keys.migrateLegacyIfNeeded(
        request.orgId,
        provider.id,
        provider.name,
        provider.apiKey,
      );
      if (migratedRef !== provider.apiKey) {
        this.providers.update(request.orgId, provider.id, { apiKey: migratedRef });
      }
      const secretName = this.keys.apiKeySecretName(migratedRef);
      const models = this.models.listByProvider(request.orgId, provider.id).map((model) => ({
        name: model.name,
        kind: model.kind,
        metadata: model.metadata,
      }));
      entries.push({
        name: provider.name,
        driver: provider.driver as Driver,
        apiUrl: provider.apiUrl ?? undefined,

        apiKey: secretName ? `secret:${secretName}` : undefined,
        headers: provider.headers,
        enabled: provider.enabled,
        models,
      });
    }
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      providers: entries,
    };
  }
}
