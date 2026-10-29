import { Injectable } from '@harnesys/brix';
import type { ImportProvidersSummary, ProviderExportEntry } from '@harnesys/studio-shared';
import {
  LlmModelPort,
  type LlmProvider,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import { parseVaultRef, secretRef } from '../../domain/secret/vault-keys.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface ImportProvidersRequest {
  orgId: string;
  providers: ProviderExportEntry[];
}

@Injectable()
export class ImportProvidersUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: ImportProvidersRequest): Promise<ImportProvidersSummary> {
    const summary: ImportProvidersSummary = {
      providersCreated: 0,
      providersUpdated: 0,
      modelsCreated: 0,
      modelsUpdated: 0,
    };
    for (const entry of request.providers) {
      const existing = this.providers.findByName(request.orgId, entry.name);
      let provider = existing
        ? this.mergeProvider(request.orgId, existing.id, entry)
        : this.createProvider(request.orgId, entry);
      provider = await this.applyApiKey(request.orgId, provider, entry);
      if (existing) {
        summary.providersUpdated += 1;
      } else {
        summary.providersCreated += 1;
      }
      this.importModels(request.orgId, provider, entry, summary);
    }
    return summary;
  }

  private async applyApiKey(
    orgId: string,
    provider: LlmProvider,
    entry: ProviderExportEntry,
  ): Promise<LlmProvider> {
    if (entry.apiKey == null || entry.apiKey === '') {
      return provider;
    }
    const ref = parseVaultRef(entry.apiKey);
    let apiKeyColumn: string | null;
    if (ref?.kind === 'secret') {
      apiKeyColumn = secretRef(ref.name);
    } else {
      apiKeyColumn = await this.keys.writeApiKey(orgId, provider.id, entry.apiKey, {
        providerName: entry.name,
      });
    }
    return this.providers.update(orgId, provider.id, { apiKey: apiKeyColumn });
  }

  private importModels(
    orgId: string,
    provider: LlmProvider,
    entry: ProviderExportEntry,
    summary: ImportProvidersSummary,
  ): void {
    for (const model of entry.models) {
      const existingModel = this.models.findByProviderAndName(orgId, provider.id, model.name);
      if (existingModel) {
        this.models.update(orgId, existingModel.id, {
          kind: model.kind,
          metadata: model.metadata,
        });
        summary.modelsUpdated += 1;
      } else {
        this.models.insert(orgId, {
          id: crypto.randomUUID(),
          providerId: provider.id,
          name: model.name,
          kind: model.kind,
          metadata: model.metadata ?? {},
          createdAt: provider.createdAt,
          updatedAt: provider.updatedAt,
        });
        summary.modelsCreated += 1;
      }
    }
  }

  private mergeProvider(orgId: string, id: string, entry: ProviderExportEntry): LlmProvider {
    return this.providers.update(orgId, id, {
      driver: entry.driver,
      apiUrl: entry.apiUrl ?? null,
      headers: entry.headers ?? {},
      enabled: entry.enabled,
    });
  }

  private createProvider(orgId: string, entry: ProviderExportEntry): LlmProvider {
    const now = new Date().toISOString();
    return this.providers.insert({
      id: crypto.randomUUID(),
      orgId,
      name: entry.name,
      driver: entry.driver,
      apiUrl: entry.apiUrl ?? null,
      apiKey: null,
      headers: entry.headers ?? {},
      enabled: entry.enabled,
      createdAt: now,
      updatedAt: now,
    });
  }
}
