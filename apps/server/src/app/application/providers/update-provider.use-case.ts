import { Injectable } from '@harnesys/brix';
import type { ProviderPublic } from '@harnesys/studio-shared';
import {
  LlmModelPort,
  type LlmProviderPatch,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { requireProvider, toProviderPublic } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface UpdateProviderRequest {
  orgId: string;
  id: string;
  name?: string;
  driver?: string;
  apiUrl?: string | null;
  apiKey?: string | null;
  apiKeySecretName?: string | null;
  headers?: Record<string, string>;
  enabled?: boolean;
}

@Injectable()
export class UpdateProviderUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: UpdateProviderRequest): Promise<ProviderPublic> {
    const current = requireProvider(this.providers, request.orgId, request.id);
    const patch: LlmProviderPatch = {};
    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name) {
        throw new ProviderValidationException('provider name cannot be empty');
      }
      patch.name = name;
    }
    if (request.driver !== undefined) {
      const driver = request.driver.trim();
      if (!driver) {
        throw new ProviderValidationException('provider driver cannot be empty');
      }
      patch.driver = driver;
    }
    if (request.apiUrl !== undefined) {
      patch.apiUrl = request.apiUrl?.trim() || null;
    }
    if (request.apiKey !== undefined) {
      patch.apiKey = await this.keys.writeApiKey(request.orgId, request.id, request.apiKey, {
        secretName: request.apiKeySecretName ?? this.keys.apiKeySecretName(current.apiKey),
        providerName: request.name?.trim() || current.name,
      });
    }
    if (request.headers !== undefined) {
      patch.headers = request.headers;
    }
    if (request.enabled !== undefined) {
      patch.enabled = request.enabled;
    }
    const updated = this.providers.update(request.orgId, request.id, patch);
    const models = this.models.listByProvider(request.orgId, updated.id);
    return toProviderPublic(
      updated,
      models,
      await this.keys.hasSecret(request.orgId, updated.id, updated.apiKey),
      this.keys.apiKeySecretName(updated.apiKey),
    );
  }
}
