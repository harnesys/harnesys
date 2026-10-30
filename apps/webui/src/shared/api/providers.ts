import type {
  DiscoveredModelView,
  Driver,
  ImportProvidersSummary,
  ProviderExportBundle,
  ProviderModelPublic,
  ProviderPublic,
} from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';
export interface CreateProviderInput {
  name: string;
  driver: Driver;
  apiUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}
export interface UpdateProviderInput {
  name?: string;
  driver?: Driver;
  apiUrl?: string | null;
  apiKey?: string | null;
  enabled?: boolean;
}
export interface AttachProviderModelInput {
  name: string;
  kind?: string;
  metadata?: unknown;
}
export interface UpdateProviderModelInput {
  name?: string;
  kind?: string;
  metadata?: unknown;
}
export interface OllamaThinkingInfo {
  values: Array<string | boolean>;
  default?: string | boolean;
}
export interface OllamaModelInfo {
  context_length?: number;
  capabilities: string[];
  thinking?: OllamaThinkingInfo;
  parameter_size?: string;
  quantization_level?: string;
}
export const providersQueryKey = ['providers'] as const;
export function providersQueryKeyFor(orgId: string) {
  return [...providersQueryKey, orgId] as const;
}
function providersBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/providers`;
}
export function listProviders(orgId: string) {
  return apiJson<ProviderPublic[]>(providersBase(orgId));
}
export function createProvider(orgId: string, input: CreateProviderInput) {
  return apiJson<ProviderPublic>(providersBase(orgId), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function updateProvider(orgId: string, id: string, input: UpdateProviderInput) {
  return apiJson<ProviderPublic>(`${providersBase(orgId)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
export function deleteProvider(orgId: string, id: string) {
  return apiJson<void>(`${providersBase(orgId)}/${id}`, { method: 'DELETE' });
}
export function exportProviders(orgId: string) {
  return apiJson<ProviderExportBundle>(`${providersBase(orgId)}/export`);
}
export function importProviders(orgId: string, bundle: ProviderExportBundle) {
  return apiJson<ImportProvidersSummary>(`${providersBase(orgId)}/import`, {
    method: 'POST',
    body: JSON.stringify(bundle),
  });
}
export function discoverProviderModels(orgId: string, id: string) {
  return apiJson<{
    found: DiscoveredModelView[];
  }>(`${providersBase(orgId)}/${id}/discover`, {
    method: 'POST',
  });
}
export function attachProviderModel(
  orgId: string,
  providerId: string,
  input: AttachProviderModelInput,
) {
  return apiJson<ProviderModelPublic>(`${providersBase(orgId)}/${providerId}/models`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
export function updateProviderModel(
  orgId: string,
  providerId: string,
  modelId: string,
  input: UpdateProviderModelInput,
) {
  return apiJson<ProviderModelPublic>(`${providersBase(orgId)}/${providerId}/models/${modelId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}
export function ollamaModelInfo(orgId: string, providerId: string, name: string) {
  return apiJson<OllamaModelInfo>(`${providersBase(orgId)}/${providerId}/ollama-info`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}
export function detachProviderModel(orgId: string, providerId: string, modelId: string) {
  return apiJson<void>(`${providersBase(orgId)}/${providerId}/models/${modelId}`, {
    method: 'DELETE',
  });
}
export function providersQuery(orgId: string) {
  return queryOptions({
    queryKey: providersQueryKeyFor(orgId),
    queryFn: () => listProviders(orgId),
    enabled: Boolean(orgId),
  });
}
