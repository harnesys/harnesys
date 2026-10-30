import type {
  CatalogItem,
  ImportPresetsResponse,
  ListPresetDetailsResponse,
  ListPresetsQuery,
  ListPresetsResponse,
  PresetDetail,
  PresetEnvelope,
  PresetKind,
  SavePresetBody,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';

export const presetsQueryKey = ['presets'] as const;

export function presetsQueryKeyFor(query?: ListPresetsQuery) {
  return [...presetsQueryKey, query?.kind ?? 'all', query?.origin ?? 'all'] as const;
}

function presetsUrl(query?: ListPresetsQuery): string {
  const params = new URLSearchParams();
  if (query?.kind) {
    params.set('kind', query.kind);
  }
  if (query?.origin) {
    params.set('origin', query.origin);
  }
  if (query?.expand) {
    params.set('expand', query.expand);
  }
  const suffix = params.toString();
  return suffix ? `/api/presets?${suffix}` : '/api/presets';
}

export async function listPresets(query?: ListPresetsQuery): Promise<CatalogItem[]> {
  const response = await apiJson<ListPresetsResponse>(presetsUrl(query));
  return response.items;
}

export function listPresetDetails(query?: ListPresetsQuery): Promise<PresetDetail[]> {
  return apiJson<ListPresetDetailsResponse>(presetsUrl({ ...query, expand: 'body' })).then(
    (response) => response.items,
  );
}

export function getPreset(kind: PresetKind, id: string): Promise<PresetDetail> {
  return apiJson<PresetDetail>(`/api/presets/${kind}/${id}`);
}

export function presetsQuery(query?: ListPresetsQuery) {
  return queryOptions({
    queryKey: presetsQueryKeyFor(query),
    queryFn: () => listPresets(query),
  });
}

export function savePreset(body: SavePresetBody): Promise<PresetDetail> {
  return apiJson<PresetDetail>('/api/presets', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deletePreset(kind: PresetKind, id: string): Promise<void> {
  return apiJson<void>(`/api/presets/${kind}/${id}`, { method: 'DELETE' });
}

export function importPresets(envelope: PresetEnvelope): Promise<ImportPresetsResponse> {
  return apiJson<ImportPresetsResponse>('/api/presets/import', {
    method: 'POST',
    body: JSON.stringify({ envelope }),
  });
}

export async function exportPresetDownload(kind: PresetKind, id: string): Promise<string> {
  const response = await authenticatedFetch(apiUrl(`/api/presets/${kind}/${id}/export`));
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }
  const envelope = (await response.json()) as PresetEnvelope;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${envelope.manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.preset.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return envelope.manifest.name;
}
