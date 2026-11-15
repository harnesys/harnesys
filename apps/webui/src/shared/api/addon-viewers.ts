import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export interface AddonViewerView {
  addonId: string;
  id: string;
  title: string;
  extensions: string[];
  route: string;
  mode: 'view' | 'edit';
  create: boolean;
  /** Full label of the "create file" entry, e.g. "New Draw.io". */
  createLabel?: string;
  /** Descriptor icon: lucide name or inline SVG data URI. */
  icon?: string;
}

export interface AddonViewerListResponse {
  viewers: AddonViewerView[];
}

export function addonViewersQuery(orgId: string) {
  return queryOptions({
    queryKey: ['addon-viewers', orgId] as const,
    queryFn: () =>
      apiJson<AddonViewerListResponse>(`/api/orgs/${encodeURIComponent(orgId)}/addon-viewers`),
    enabled: Boolean(orgId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
