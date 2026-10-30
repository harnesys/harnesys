import type { FleetNode, RotateNodeTokenResponse } from '@harnesys/contracts';
import {
  type ExecutionProfile,
  type ExecutionProfileDetail,
  type ExecutionProfilesResponse,
  LOCAL_EXECUTION_PROFILE_ID,
  type UpdateExecutionProfileBody,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getActiveOrgId } from './active-org';
import { apiUrl } from './client';
import { authenticatedFetch } from './session';

export type { ExecutionProfile, ExecutionProfileDetail, ExecutionProfilesResponse, FleetNode };
export { LOCAL_EXECUTION_PROFILE_ID };

export interface ActiveInvite {
  inviteId: string;
  code: string;
  nodeName: string;
  expiresAt: string;
  createdAt: string;
}

export interface IssuedInvite {
  inviteId: string;
  code: string;
  expiresAt: string;
  relayUrlHint: string | null;
}

export interface ConnectInfo {
  port: number;
  publicOrigin: string | null;
  lanAddresses: string[];
  relayUrlHint: string;
}

export interface PairResult {
  ok: true;
  nodeId: string;
  orgId: string;
  orgName: string;
}

export interface PromoteStartResult {
  promoteToken: string;
  orgId: string;
  expiresAt: string;
  newRelayUrl: string;
}

async function apiJson<T>(path: string, init?: RequestInit & { orgId?: string }): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.orgId) {
    headers.set('X-Org-Id', init.orgId);
  }
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const { orgId: _orgId, ...rest } = init ?? {};
  const response = await authenticatedFetch(apiUrl(path), { ...rest, headers });
  if (response.status === 204) {
    return undefined as T;
  }
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

export function listFleetNodes(orgId: string): Promise<{ nodes: FleetNode[] }> {
  return apiJson('/api/fleet/nodes', { orgId });
}

export function listExecutionProfiles(orgId: string): Promise<ExecutionProfilesResponse> {
  return apiJson('/api/fleet/profiles', { orgId });
}

export function getExecutionProfile(
  orgId: string,
  profileId: string,
): Promise<ExecutionProfileDetail> {
  return apiJson(`/api/fleet/profiles/${encodeURIComponent(profileId)}`, { orgId });
}

export function createExecutionProfile(orgId: string, name: string): Promise<ExecutionProfile> {
  return apiJson('/api/fleet/profiles', {
    method: 'POST',
    orgId,
    body: JSON.stringify({ name }),
  });
}

export function updateExecutionProfile(
  orgId: string,
  profileId: string,
  body: UpdateExecutionProfileBody,
): Promise<ExecutionProfile> {
  return apiJson(`/api/fleet/profiles/${encodeURIComponent(profileId)}`, {
    method: 'PATCH',
    orgId,
    body: JSON.stringify(body),
  });
}

export function setExecutionProfileNodes(
  orgId: string,
  profileId: string,
  nodeIds: string[],
): Promise<ExecutionProfile> {
  return apiJson(`/api/fleet/profiles/${encodeURIComponent(profileId)}/nodes`, {
    method: 'PUT',
    orgId,
    body: JSON.stringify({ nodeIds }),
  });
}

export function setDefaultExecutionProfile(orgId: string, profileId: string): Promise<void> {
  return apiJson('/api/fleet/profiles/default', {
    method: 'PUT',
    orgId,
    body: JSON.stringify({ profileId }),
  });
}

export function deleteExecutionProfile(orgId: string, profileId: string): Promise<void> {
  return apiJson(`/api/fleet/profiles/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    orgId,
  });
}

export function listInvites(orgId: string): Promise<ActiveInvite[]> {
  return apiJson('/api/fleet/invites', { orgId });
}

export function issueInvite(
  orgId: string,
  input: { nodeName: string; ttlMin?: number },
): Promise<IssuedInvite> {
  return apiJson('/api/fleet/invites', {
    method: 'POST',
    orgId,
    body: JSON.stringify(input),
  });
}

export function revokeInvite(orgId: string, inviteId: string): Promise<void> {
  return apiJson(`/api/fleet/invites/${encodeURIComponent(inviteId)}`, {
    method: 'DELETE',
    orgId,
  });
}

export function fetchConnectInfo(): Promise<ConnectInfo> {
  return apiJson('/api/fleet/connect-info');
}

export function pairWithRelay(input: {
  relayUrl: string;
  inviteCode: string;
  nodeName: string;
  orgId: string;
}): Promise<PairResult> {
  return apiJson('/api/discovery/pair', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function startPromote(
  orgId: string,
  input: { targetNodeId: string; newRelayUrl: string },
): Promise<PromoteStartResult> {
  return apiJson('/api/fleet/promote', {
    method: 'POST',
    orgId,
    body: JSON.stringify(input),
  });
}

export function acceptPromote(input: {
  orgId: string;
  sourceRelayUrl: string;
  promoteToken: string;
}): Promise<{ ok: true; orgId: string; role: 'relay' }> {
  return apiJson('/api/discovery/promote/accept', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type FleetInvite = ActiveInvite;
export type IssuedFleetInvite = IssuedInvite;
export interface IssueFleetInviteInput {
  nodeName: string;
  ttlMin?: number;
}
export type FleetConnectInfo = ConnectInfo;

export const fleetNodesQuery = queryOptions({
  queryKey: ['fleet', 'nodes'] as const,
  queryFn: async (): Promise<FleetNode[]> => {
    const orgId = getActiveOrgId();
    if (!orgId) {
      return [];
    }
    const { nodes } = await listFleetNodes(orgId);
    return nodes;
  },
  staleTime: 5000,
});

export function executionProfilesQueryKey(orgId: string) {
  return ['fleet', 'profiles', orgId] as const;
}

export function executionProfilesQuery(orgId: string) {
  return queryOptions({
    queryKey: executionProfilesQueryKey(orgId),
    queryFn: async (): Promise<ExecutionProfilesResponse> => {
      if (!orgId) {
        return { items: [], defaultProfileId: null };
      }
      return listExecutionProfiles(orgId);
    },
    staleTime: 5000,
    enabled: Boolean(orgId),
  });
}

export function executionProfileQueryKey(orgId: string, profileId: string) {
  return ['fleet', 'profiles', orgId, profileId] as const;
}

export function fetchFleetConnectInfo(): Promise<FleetConnectInfo> {
  return fetchConnectInfo();
}

export const fleetConnectInfoQuery = queryOptions({
  queryKey: ['fleet', 'connect-info'] as const,
  queryFn: fetchFleetConnectInfo,
  staleTime: 60_000,
});

export function listFleetInvites(): Promise<FleetInvite[]> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return Promise.resolve([]);
  }
  return listInvites(orgId);
}

export const fleetInvitesQuery = queryOptions({
  queryKey: ['fleet', 'invites'] as const,
  queryFn: listFleetInvites,
});

export function issueFleetInvite(body: IssueFleetInviteInput): Promise<IssuedFleetInvite> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return Promise.reject(new Error('No active organization'));
  }
  return issueInvite(orgId, body);
}

export function revokeFleetInvite(inviteId: string): Promise<void> {
  const orgId = getActiveOrgId();
  if (!orgId) {
    return Promise.reject(new Error('No active organization'));
  }
  return revokeInvite(orgId, inviteId);
}

export function disconnectNode(orgId: string, nodeId: string): Promise<void> {
  return apiJson(`/api/fleet/nodes/${encodeURIComponent(nodeId)}/disconnect`, {
    method: 'POST',
    orgId,
  });
}

export function rotateNode(orgId: string, nodeId: string): Promise<RotateNodeTokenResponse> {
  return apiJson(`/api/fleet/nodes/${encodeURIComponent(nodeId)}/rotate`, {
    method: 'POST',
    orgId,
  });
}

export function removeNode(orgId: string, nodeId: string): Promise<void> {
  return apiJson(`/api/fleet/nodes/${encodeURIComponent(nodeId)}`, {
    method: 'DELETE',
    orgId,
  });
}

export {
  isRemoteProjectCached,
  projectNodeCached,
  rememberProjectNode,
  rememberSelfNode,
  selfNodeCached,
} from './self-node';

export function useIsRemoteProject(_projectId: string | null | undefined): boolean {
  return false;
}
