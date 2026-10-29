import type {
  CreateModePresetBody,
  ListModePresetsResponse,
  ModePresetPublic,
  UpdateModePresetBody,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type {
  CreateModePresetBody,
  ListModePresetsResponse,
  ModePresetPublic,
  UpdateModePresetBody,
};

function modePresetsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/mode-presets`;
}

export function orgModePresetsQueryKey(orgId: string) {
  return ['orgs', orgId, 'mode-presets'] as const;
}

export function listOrgModePresets(orgId: string) {
  return apiJson<ListModePresetsResponse>(modePresetsBase(orgId));
}

export function orgModePresetsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgModePresetsQueryKey(orgId),
    queryFn: () => listOrgModePresets(orgId),
    enabled: Boolean(orgId),
  });
}

export function createOrgModePreset(orgId: string, body: CreateModePresetBody) {
  return apiJson<ModePresetPublic>(modePresetsBase(orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateOrgModePreset(orgId: string, id: string, body: UpdateModePresetBody) {
  return apiJson<ModePresetPublic>(`${modePresetsBase(orgId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteOrgModePreset(orgId: string, id: string) {
  return apiJson<void>(`${modePresetsBase(orgId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
