import type { AddonPackageView, AddonPolicyView, InstallPlan } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

function packagesBase() {
  return '/api/addons/packages';
}

export function addonPackagesQuery() {
  return queryOptions({
    queryKey: ['addon-packages'] as const,
    queryFn: () => apiJson<{ items: AddonPackageView[] }>(packagesBase()),
    enabled: true,
  });
}

export function planAddonInstall(body: { source: string }): Promise<InstallPlan> {
  return apiJson<InstallPlan>(`${packagesBase()}/plan`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function confirmAddonInstall(planId: string): Promise<void> {
  return apiJson<void>(`${packagesBase()}/plan/${encodeURIComponent(planId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function deleteAddonPackage(id: string, version: string): Promise<void> {
  return apiJson<void>(
    `${packagesBase()}/${encodeURIComponent(id)}/${encodeURIComponent(version)}`,
    { method: 'DELETE' },
  );
}

export function pruneAddonPackages(): Promise<void> {
  return apiJson<void>(`${packagesBase()}/prune`, { method: 'POST' });
}

export function getAddonPolicy(): Promise<AddonPolicyView> {
  return apiJson<AddonPolicyView>('/api/addons/policy');
}

export function putAddonPolicy(policy: AddonPolicyView): Promise<AddonPolicyView> {
  return apiJson<AddonPolicyView>('/api/addons/policy', {
    method: 'PUT',
    body: JSON.stringify(policy),
  });
}
