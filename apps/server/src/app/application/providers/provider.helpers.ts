import {
  type Driver,
  isEffort,
  type ModelRecord,
  type ProviderModelPublic,
  type ProviderPublic,
} from '@harnesys/studio-shared';
import { resolveModel } from 'harnesys';
import type {
  LlmModel,
  LlmProvider,
  LlmProviderPort,
} from '../../domain/provider/llm-provider.port.ts';
import {
  ProviderModelNotFoundException,
  ProviderNotFoundException,
  ProviderValidationException,
} from '../../domain/provider/provider.error.ts';

export function requireProvider(
  providers: LlmProviderPort,
  orgId: string,
  providerId: string,
): LlmProvider {
  const provider = providers.findById(orgId, providerId);
  if (!provider) {
    throw new ProviderNotFoundException(providerId);
  }
  return provider;
}

export function requireModel(
  models: {
    findById(orgId: string, id: string): LlmModel | undefined;
  },
  orgId: string,
  providerId: string,
  modelId: string,
): LlmModel {
  const model = models.findById(orgId, modelId);
  if (!model || model.providerId !== providerId) {
    throw new ProviderModelNotFoundException(modelId);
  }
  return model;
}

export function assertModelEffortSupported(model: LlmModel, effort: string): void {
  const resolved = resolveModel(toModelRecord(model));
  if (effort === 'none' && resolved.reasoningMandatory === true) {
    throw new ProviderValidationException('model does not allow disabling reasoning');
  }
  const levels = resolved.effort ?? [];
  if (levels.length === 0) {
    throw new ProviderValidationException('model does not support effort');
  }
  if (!levels.includes(effort)) {
    throw new ProviderValidationException(`effort ${effort} is not supported by model`);
  }
}

export function toModelPublic(model: LlmModel, _driver: string): ProviderModelPublic {
  const record = toModelRecord(model);
  const resolved = resolveModel(record);
  const chatLike = model.kind === 'chat' || model.kind === '';
  const efforts = (resolved.effort ?? []).filter(isEffort);
  return {
    ...record,
    id: model.id,
    name: model.name,
    kind: model.kind,
    metadata: model.metadata,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
    missing: [],
    verified: false,
    efforts,
    contextWindow: resolved.context_length,
    pricing: resolved.pricing,
    supported_parameters: chatLike
      ? [...(resolved.supported_parameters ?? [])]
      : resolved.supported_parameters,
  };
}

export function toProviderPublic(
  provider: LlmProvider,
  models: LlmModel[],
  hasSecret = false,
  apiKeySecretName: string | null = null,
): ProviderPublic {
  return {
    id: provider.id,
    name: provider.name,
    driver: provider.driver as Driver,
    apiUrl: provider.apiUrl ?? undefined,
    hasKey: Boolean(apiKeySecretName) || Boolean(provider.apiKey) || hasSecret,
    apiKeySecretName,
    headers: provider.headers,
    enabled: provider.enabled,
    models: models.map((model) => toModelPublic(model, provider.driver)),
  };
}

function toModelRecord(model: LlmModel): ModelRecord {
  const metadata =
    typeof model.metadata === 'object' && model.metadata !== null ? model.metadata : {};
  return { ...metadata, name: model.name } as ModelRecord;
}
