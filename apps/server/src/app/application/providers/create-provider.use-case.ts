import { Injectable } from '@harnesys/brix';
import type { ProviderPublic } from '@harnesys/studio-shared';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { toProviderPublic } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface CreateProviderRequest {
  orgId: string;
  name: string;
  driver: string;
  apiUrl?: string | null;
  apiKey?: string | null;
  apiKeySecretName?: string | null;
  headers?: Record<string, string>;
  enabled?: boolean;
}

@Injectable()
export class CreateProviderUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: CreateProviderRequest): Promise<ProviderPublic> {
    const name = request.name?.trim();
    if (!name) {
      throw new ProviderValidationException('provider name cannot be empty');
    }
    const driver = request.driver?.trim();
    if (!driver) {
      throw new ProviderValidationException('provider driver cannot be empty');
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const storedKey = await this.keys.writeApiKey(request.orgId, id, request.apiKey ?? null, {
      secretName: request.apiKeySecretName,
      providerName: name,
    });
    const inserted = this.providers.insert({
      id,
      orgId: request.orgId,
      name,
      driver,
      apiUrl: request.apiUrl?.trim() || null,
      apiKey: storedKey,
      headers: request.headers ?? {},
      enabled: request.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    });
    const models = this.models.listByProvider(request.orgId, inserted.id);
    return toProviderPublic(
      inserted,
      models,
      await this.keys.hasSecret(request.orgId, inserted.id, inserted.apiKey),
      this.keys.apiKeySecretName(inserted.apiKey),
    );
  }
}
