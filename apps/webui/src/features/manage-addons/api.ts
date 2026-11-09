import type {
  AddonConfigValues,
  AddonDetail,
  AddonLogLine,
  AddonSummary,
  SetAddonConfigBody,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { AddonConfigValues, AddonDetail, AddonLogLine, AddonSummary, SetAddonConfigBody };

export function orgAddonsQueryKey(orgId: string) {
  return ['orgs', orgId, 'addons'] as const;
}

function addonsBase(orgId: string) {
  return `/api/orgs/${encodeURIComponent(orgId)}/addons`;
}

function addonBase(orgId: string, addonId: string) {
  return `${addonsBase(orgId)}/${encodeURIComponent(addonId)}`;
}

export function listOrgAddons(orgId: string) {
  return apiJson<AddonSummary[]>(addonsBase(orgId));
}

export function orgAddonsQuery(orgId: string) {
  return queryOptions({
    queryKey: orgAddonsQueryKey(orgId),
    queryFn: () => listOrgAddons(orgId),
    enabled: Boolean(orgId),
  });
}

export function getOrgAddon(orgId: string, addonId: string) {
  return apiJson<AddonDetail>(addonBase(orgId, addonId));
}

export function enableOrgAddon(orgId: string, addonId: string) {
  return apiJson<AddonSummary>(`${addonBase(orgId, addonId)}/enable`, { method: 'POST' });
}

export function disableOrgAddon(orgId: string, addonId: string) {
  return apiJson<AddonSummary>(`${addonBase(orgId, addonId)}/disable`, { method: 'POST' });
}

export function setOrgAddonConfig(orgId: string, addonId: string, values: AddonConfigValues) {
  const body: SetAddonConfigBody = { values };
  return apiJson<AddonConfigValues>(`${addonBase(orgId, addonId)}/config`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function getOrgAddonLogs(orgId: string, addonId: string, since: number) {
  return apiJson<AddonLogLine[]>(
    `${addonBase(orgId, addonId)}/logs?since=${encodeURIComponent(String(since))}`,
  );
}
