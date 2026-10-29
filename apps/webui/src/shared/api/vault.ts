import type {
  PutVaultEntryBody,
  VaultEntry,
  VaultEntryKind,
  VaultListResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type { VaultEntry, VaultEntryKind };

export const vaultQueryKey = ['vault'] as const;

export function vaultQueryKeyFor(orgId: string) {
  return [...vaultQueryKey, orgId] as const;
}

function vaultBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/vault`;
}

export function listVault(orgId: string) {
  return apiJson<VaultListResponse>(vaultBase(orgId));
}

export function putVaultEntry(orgId: string, name: string, body: PutVaultEntryBody) {
  return apiJson<VaultEntry>(`${vaultBase(orgId)}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteVaultEntry(orgId: string, name: string) {
  return apiJson<void>(`${vaultBase(orgId)}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export function vaultQuery(orgId: string) {
  return queryOptions({
    queryKey: vaultQueryKeyFor(orgId),
    queryFn: () => listVault(orgId),
    enabled: Boolean(orgId),
  });
}
