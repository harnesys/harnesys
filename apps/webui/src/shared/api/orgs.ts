import type { MachineOrgEntry } from '@harnesys/studio-shared';
import { ApiError, apiJson, apiUrl } from './client';
import { authenticatedFetch } from './session';

export type { MachineOrgEntry };

export interface OrgsListResponse {
  orgs: MachineOrgEntry[];
  activeOrgId: string | null;
}

export interface UpdateOrgInput {
  name?: string;
  description?: string;
}

export interface CreateOrgInput {
  name: string;
  workspacePath?: string;
}

export function listOrgs(): Promise<OrgsListResponse> {
  return apiJson<OrgsListResponse>('/api/orgs');
}

export function createOrg(input: CreateOrgInput): Promise<MachineOrgEntry> {
  return apiJson<MachineOrgEntry>('/api/orgs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function activateOrg(orgId: string): Promise<void> {
  return apiJson<void>(`/api/orgs/${encodeURIComponent(orgId)}/activate`, {
    method: 'POST',
  });
}

export function updateOrg(orgId: string, body: UpdateOrgInput): Promise<MachineOrgEntry> {
  return apiJson<MachineOrgEntry>(`/api/orgs/${encodeURIComponent(orgId)}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteOrg(orgId: string): Promise<void> {
  return apiJson<void>(`/api/orgs/${encodeURIComponent(orgId)}`, {
    method: 'DELETE',
  });
}

export async function downloadOrgBackup(orgId: string): Promise<void> {
  const response = await authenticatedFetch(
    apiUrl(`/api/orgs/${encodeURIComponent(orgId)}/backup`),
  );
  if (!response.ok) {
    throw new ApiError(response.status, 'Organization backup failed');
  }
  const fileName =
    fileNameFromDisposition(response.headers.get('Content-Disposition')) ??
    `harnesys-org-${orgId}.tar.gz`;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function restoreOrgBackup(file: File): Promise<MachineOrgEntry> {
  const body = new FormData();
  body.append('file', file);
  return apiJson<MachineOrgEntry>('/api/orgs/restore', {
    method: 'POST',
    body,
  });
}

function fileNameFromDisposition(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const match = /filename="?([^";]+)"?/.exec(value);
  return match?.[1] ?? null;
}
