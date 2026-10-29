import type {
  ConnectorPublic,
  IssuePairCodeResponse,
  ListConnectorsResponse,
  MirrorPolicyPublic,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
  UpsertTelegramConnectorResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { ConnectorPublic, MirrorPolicyPublic };

function connectorsBase(orgId: string, agentId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/agents/${encodeURIComponent(agentId)}/connectors`;
}

export function agentConnectorsQueryKey(orgId: string, agentId: string) {
  return ['orgs', orgId, 'agents', agentId, 'connectors'] as const;
}

export function listAgentConnectors(orgId: string, agentId: string) {
  return apiJson<ListConnectorsResponse>(connectorsBase(orgId, agentId));
}

export function agentConnectorsQuery(orgId: string, agentId: string) {
  return queryOptions({
    queryKey: agentConnectorsQueryKey(orgId, agentId),
    queryFn: () => listAgentConnectors(orgId, agentId),
    enabled: Boolean(orgId && agentId),
  });
}

export function upsertTelegramConnector(orgId: string, agentId: string, token: string) {
  return apiJson<UpsertTelegramConnectorResponse>(`${connectorsBase(orgId, agentId)}/telegram`, {
    method: 'PUT',
    body: JSON.stringify({ token }),
  });
}

export function issueTelegramPairCode(orgId: string, agentId: string) {
  return apiJson<IssuePairCodeResponse>(`${connectorsBase(orgId, agentId)}/telegram/pair-code`, {
    method: 'POST',
  });
}

export function pauseTelegramConnector(orgId: string, agentId: string) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId, agentId)}/telegram/pause`,
    { method: 'POST' },
  );
}

export function resumeTelegramConnector(orgId: string, agentId: string) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId, agentId)}/telegram/resume`,
    { method: 'POST' },
  );
}

export function unpairTelegramConnector(orgId: string, agentId: string) {
  return apiJson<UnpairTelegramConnectorResponse>(
    `${connectorsBase(orgId, agentId)}/telegram/unpair`,
    { method: 'POST' },
  );
}

export function patchTelegramPolicy(orgId: string, agentId: string, body: PatchTelegramPolicyBody) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId, agentId)}/telegram/policy`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
  );
}

export function removeTelegramConnector(orgId: string, agentId: string) {
  return apiJson<void>(`${connectorsBase(orgId, agentId)}/telegram`, {
    method: 'DELETE',
  });
}
