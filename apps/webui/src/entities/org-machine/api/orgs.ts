import type { MachineOrgEntry } from '@harnesys/studio-shared';
import { apiJson } from '@/shared/api/client';

export interface OrgsListResponse {
  orgs: MachineOrgEntry[];
  activeOrgId: string | null;
}

export function listOrgs(): Promise<OrgsListResponse> {
  return apiJson<OrgsListResponse>('/api/orgs');
}

export function createOrg(name: string): Promise<MachineOrgEntry> {
  return apiJson<MachineOrgEntry>('/api/orgs', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function activateOrg(orgId: string): Promise<void> {
  return apiJson<void>(`/api/orgs/${encodeURIComponent(orgId)}/activate`, {
    method: 'POST',
  });
}
