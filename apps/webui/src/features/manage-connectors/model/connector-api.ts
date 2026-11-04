import type {
  AttachChatBody,
  AttachChatResponse,
  ConnectChatBody,
  ConnectChatResponse,
  ConnectorBindingPublic,
  ConnectorPublic,
  CreateTopicResponse,
  IssuePairCodeResponse,
  ListConnectorsQuery,
  ListConnectorsResponse,
  MirrorPolicyPublic,
  PatchTelegramPolicyBody,
  TelegramConnectorActionResponse,
  UnpairTelegramConnectorResponse,
  UpsertTelegramConnectorResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/client';

export type { ConnectorBindingPublic, ConnectorPublic, MirrorPolicyPublic };

export function orgConnectorsBaseKey(orgId: string) {
  return ['orgs', orgId, 'connectors'] as const;
}

export function orgConnectorsQueryKey(orgId: string, query: ListConnectorsQuery = {}) {
  return [...orgConnectorsBaseKey(orgId), query] as const;
}

export function orgThreadsQueryKey(orgId: string) {
  return ['orgs', orgId, 'connectors', 'threads'] as const;
}

function connectorsBase(orgId: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}/connectors`;
}

export function listOrgConnectors(orgId: string, query: ListConnectorsQuery = {}) {
  const params = new URLSearchParams();
  if (query.provider) {
    params.set('provider', query.provider);
  }
  if (query.agentId) {
    params.set('agentId', query.agentId);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return apiJson<ListConnectorsResponse>(`${connectorsBase(orgId)}${suffix}`);
}

export function orgConnectorsQuery(orgId: string, query: ListConnectorsQuery = {}) {
  return queryOptions({
    queryKey: orgConnectorsQueryKey(orgId, query),
    queryFn: () => listOrgConnectors(orgId, query),
    enabled: Boolean(orgId),
  });
}

export function createTelegramBot(orgId: string, token: string) {
  return apiJson<UpsertTelegramConnectorResponse>(`${connectorsBase(orgId)}/telegram`, {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function updateTelegramBot(orgId: string, connectorId: string, token: string) {
  return apiJson<UpsertTelegramConnectorResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram`,
    { method: 'PUT', body: JSON.stringify({ token }) },
  );
}

export function removeTelegramBot(orgId: string, connectorId: string) {
  return apiJson<void>(`${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}`, {
    method: 'DELETE',
  });
}

export function issueTelegramPairCode(orgId: string, connectorId: string) {
  return apiJson<IssuePairCodeResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/pair-code`,
    { method: 'POST' },
  );
}

export function pauseTelegramBot(orgId: string, connectorId: string) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/pause`,
    { method: 'POST' },
  );
}

export function resumeTelegramBot(orgId: string, connectorId: string) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/resume`,
    { method: 'POST' },
  );
}

export function unpairTelegramBot(orgId: string, connectorId: string) {
  return apiJson<UnpairTelegramConnectorResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/unpair`,
    { method: 'POST' },
  );
}

export function patchTelegramPolicy(
  orgId: string,
  connectorId: string,
  body: PatchTelegramPolicyBody,
) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/policy`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

export function attachChat(orgId: string, connectorId: string, body: AttachChatBody) {
  return apiJson<AttachChatResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/chats/attach`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function connectChat(
  orgId: string,
  connectorId: string,
  bindingId: string,
  body: ConnectChatBody,
) {
  return apiJson<ConnectChatResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/chats/${encodeURIComponent(bindingId)}/connect`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function disconnectChat(orgId: string, connectorId: string, bindingId: string) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/chats/${encodeURIComponent(bindingId)}/connect`,
    { method: 'DELETE' },
  );
}

export function createTopic(orgId: string, connectorId: string, bindingId: string, name: string) {
  return apiJson<CreateTopicResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/chats/${encodeURIComponent(bindingId)}/topics`,
    { method: 'POST', body: JSON.stringify({ name }) },
  );
}

export function forgetChat(orgId: string, connectorId: string, bindingId: string) {
  return apiJson<TelegramConnectorActionResponse>(
    `${connectorsBase(orgId)}/${encodeURIComponent(connectorId)}/telegram/chats/${encodeURIComponent(bindingId)}`,
    { method: 'DELETE' },
  );
}

export function telegramBotGroupLink(botUsername: string): string {
  return `https://t.me/${botUsername}?startgroup=true`;
}

export function telegramBotLink(botUsername: string): string {
  return `https://t.me/${botUsername}`;
}
