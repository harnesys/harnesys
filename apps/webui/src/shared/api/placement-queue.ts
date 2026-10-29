import type { PlacementQueueItem, PlacementQueueResponse } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiUrl } from './client';
import { authenticatedFetch } from './session';

async function apiJson<T>(path: string, init?: RequestInit & { orgId?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.orgId) {
    headers.set('X-Org-Id', init.orgId);
  }
  const { orgId: _orgId, ...rest } = init ?? {};
  const response = await authenticatedFetch(apiUrl(path), { ...rest, headers });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
        ? body.message
        : response.statusText || `request failed (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

export function listPlacementQueue(
  orgId: string,
  profileId: string,
): Promise<PlacementQueueResponse> {
  return apiJson(`/api/fleet/profiles/${encodeURIComponent(profileId)}/queue`, { orgId });
}

export function placementQueueQueryKey(orgId: string, profileId: string) {
  return ['fleet', 'placement-queue', orgId, profileId] as const;
}

export function placementQueueQuery(orgId: string, profileId: string) {
  return queryOptions({
    queryKey: placementQueueQueryKey(orgId, profileId),
    queryFn: async (): Promise<PlacementQueueItem[]> => {
      if (!orgId || !profileId) {
        return [];
      }
      const response = await listPlacementQueue(orgId, profileId);
      return response.items;
    },
    staleTime: 5000,
    enabled: Boolean(orgId && profileId),
  });
}
