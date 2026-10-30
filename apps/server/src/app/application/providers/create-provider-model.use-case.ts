import { Injectable } from '@harnesys/brix';
import type { ProviderModelPublic } from '@harnesys/studio-shared';
import type { DiscoveredModel, ModelFields } from 'harnesys';
import { discoverModelDetails, isModelKind, isModelKindSupported } from 'harnesys';
import {
  LlmModelPort,
  type LlmProvider,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import { ProviderValidationException } from '../../domain/provider/provider.error.ts';
import { requireProvider, toModelPublic } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

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
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: CreateProviderModelRequest): Promise<ProviderModelPublic> {
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
      metadata: await this.enrichedMetadata(request.orgId, provider, name, request.metadata),
      createdAt: now,
      updatedAt: now,
    });
    return toModelPublic(inserted, provider.driver);
  }
  private async enrichedMetadata(
    orgId: string,
    provider: LlmProvider,
    name: string,
    userMetadata: unknown,
  ): Promise<ModelFields> {
    const details = await this.fetchDetails(orgId, provider, name);
    return { ...metadataFields(details), ...withoutEmptyValues(userMetadata) };
  }
  private async fetchDetails(
    orgId: string,
    provider: LlmProvider,
    name: string,
  ): Promise<DiscoveredModel | undefined> {
    try {
      const apiKey = await this.keys.resolveApiKey(orgId, provider.id, provider.apiKey);
      return await discoverModelDetails(
        {
          driver: provider.driver,
          apiUrl: provider.apiUrl ?? undefined,
          apiKey,
          headers: provider.headers ?? undefined,
        },
        name,
      );
    } catch {
      return undefined;
    }
  }
}
const METADATA_KEYS = [
  'description',
  'context_length',
  'architecture',
  'pricing',
  'top_provider',
  'supported_parameters',
  'effort',
  'defaultEffort',
  'reasoningMandatory',
] as const;
function metadataFields(model: Awaited<ReturnType<typeof discoverModelDetails>>): ModelFields {
  if (!model) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const key of METADATA_KEYS) {
    if (model[key] !== undefined) {
      out[key] = model[key];
    }
  }
  return out as ModelFields;
}
function withoutEmptyValues(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    out[key] = value;
  }
  return out;
}
