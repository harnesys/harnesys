import type { MachineOrgEntry } from '@harnesys/studio-shared';
import { apiJson } from './client';

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
