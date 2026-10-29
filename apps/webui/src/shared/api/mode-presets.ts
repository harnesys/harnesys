import type { ModeOpPermissions, ModePreset, PackAssignment } from '@harnesys/studio-shared';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';
export type ModePresetRecord = ModePreset;
export interface ModePresetBody {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  packs?: Record<string, PackAssignment | null>;
  permissions?: ModeOpPermissions;
  installedByDefault?: boolean;
}
export type ModePresetPatch = Partial<Omit<ModePresetBody, 'id'>>;
export const modePresetsQueryKey = ['mode-presets'] as const;
export function modePresetsQueryKeyFor(projectId: string) {
  return [...modePresetsQueryKey, projectId] as const;
}
function modePresetsBase(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/mode-presets`;
}
export function listModePresets(projectId: string) {
  return apiJson<ModePresetRecord[]>(modePresetsBase(projectId));
}
export function modePresetsQuery(projectId: string) {
  return queryOptions({
    queryKey: modePresetsQueryKeyFor(projectId),
    queryFn: () => listModePresets(projectId),
    enabled: Boolean(projectId),
  });
}
export function createModePreset(
  projectId: string,
  body: ModePresetBody,
): Promise<ModePresetRecord> {
  return apiJson<ModePresetRecord>(modePresetsBase(projectId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
export function updateModePreset(
  projectId: string,
  id: string,
  body: ModePresetPatch,
): Promise<ModePresetRecord> {
  return apiJson<ModePresetRecord>(`${modePresetsBase(projectId)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}
export function deleteModePreset(projectId: string, id: string): Promise<void> {
  return apiJson<void>(`${modePresetsBase(projectId)}/${id}`, {
    method: 'DELETE',
  });
}
