import type {
  AccountResponse,
  AccountsListQuery,
  AccountsListResponse,
  AppResponse,
  AppsListResponse,
  CatalogResponse,
  ConnectResumeResponse,
  ConnectSessionResponse,
  ConnectStartBody,
  ConnectStartResponse,
  CreateAppBody,
  FieldValue,
  SessionEvent,
  UpdateAccountBody,
  UpdateAppBody,
} from '@harnesys/contracts';
import { SessionEventSchema } from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';
import { watchEventSource } from './sse';

function orgPath(orgId: string, suffix: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}${suffix}`;
}

export function appsQueryKey(orgId: string) {
  return ['apps', orgId] as const;
}

export function catalogQuery(orgId: string) {
  return queryOptions({
    queryKey: [...appsQueryKey(orgId), 'catalog'] as const,
    queryFn: () => apiJson<CatalogResponse>(orgPath(orgId, '/apps/catalog')),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    enabled: Boolean(orgId),
  });
}

export function appsQuery(orgId: string) {
  return queryOptions({
    queryKey: [...appsQueryKey(orgId), 'list'] as const,
    queryFn: () => apiJson<AppsListResponse>(orgPath(orgId, '/apps')),
    enabled: Boolean(orgId),
  });
}

export function accountsQueryKey(orgId: string) {
  return [...appsQueryKey(orgId), 'accounts'] as const;
}

export function accountsQuery(orgId: string, filter: AccountsListQuery = {}) {
  const params = new URLSearchParams();
  if (filter.kind) {
    params.set('kind', filter.kind);
  }
  if (filter.appId) {
    params.set('appId', filter.appId);
  }
  if (filter.status) {
    params.set('status', filter.status);
  }
  if (filter.scopes) {
    params.set('scopes', filter.scopes);
  }
  const search = params.toString();
  return queryOptions({
    queryKey: [...accountsQueryKey(orgId), search] as const,
    queryFn: () =>
      apiJson<AccountsListResponse>(orgPath(orgId, search ? `/accounts?${search}` : '/accounts')),
    enabled: Boolean(orgId),
  });
}

export function createApp(orgId: string, body: CreateAppBody): Promise<AppResponse> {
  return apiJson<AppResponse>(orgPath(orgId, '/apps'), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateApp(orgId: string, appId: string, body: UpdateAppBody): Promise<AppResponse> {
  return apiJson<AppResponse>(orgPath(orgId, `/apps/${encodeURIComponent(appId)}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteApp(orgId: string, appId: string): Promise<void> {
  return apiJson<void>(orgPath(orgId, `/apps/${encodeURIComponent(appId)}`), { method: 'DELETE' });
}

export function verifyApp(orgId: string, appId: string): Promise<AppResponse> {
  return apiJson<AppResponse>(orgPath(orgId, `/apps/${encodeURIComponent(appId)}/verify`), {
    method: 'POST',
  });
}

export function updateAccount(
  orgId: string,
  accountId: string,
  body: UpdateAccountBody,
): Promise<AccountResponse> {
  return apiJson<AccountResponse>(orgPath(orgId, `/accounts/${encodeURIComponent(accountId)}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAccount(orgId: string, accountId: string): Promise<void> {
  return apiJson<void>(orgPath(orgId, `/accounts/${encodeURIComponent(accountId)}`), {
    method: 'DELETE',
  });
}

export function verifyAccount(orgId: string, accountId: string): Promise<AccountResponse> {
  return apiJson<AccountResponse>(
    orgPath(orgId, `/accounts/${encodeURIComponent(accountId)}/verify`),
    { method: 'POST' },
  );
}

export function startConnect(orgId: string, body: ConnectStartBody): Promise<ConnectStartResponse> {
  return apiJson<ConnectStartResponse>(orgPath(orgId, '/connect/start'), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function resumeConnect(
  orgId: string,
  sessionId: string,
  inputs: Record<string, FieldValue>,
): Promise<ConnectResumeResponse> {
  return apiJson<ConnectResumeResponse>(
    orgPath(orgId, `/connect/sessions/${encodeURIComponent(sessionId)}/resume`),
    {
      method: 'POST',
      body: JSON.stringify({ inputs }),
    },
  );
}

export function getConnectSession(
  orgId: string,
  sessionId: string,
): Promise<ConnectSessionResponse> {
  return apiJson<ConnectSessionResponse>(
    orgPath(orgId, `/connect/sessions/${encodeURIComponent(sessionId)}`),
  );
}

export function cancelConnect(orgId: string, sessionId: string): Promise<void> {
  return apiJson<void>(orgPath(orgId, `/connect/sessions/${encodeURIComponent(sessionId)}`), {
    method: 'DELETE',
  });
}

export function watchConnectSession(
  orgId: string,
  sessionId: string,
  onEvent: (event: SessionEvent) => void,
  onError?: () => void,
): () => void {
  const url = orgPath(orgId, `/connect/sessions/${encodeURIComponent(sessionId)}/events`);
  return watchEventSource(
    url,
    'session',
    (data) => {
      try {
        const parsed = SessionEventSchema.safeParse(JSON.parse(data));
        if (parsed.success) {
          onEvent(parsed.data);
        }
      } catch {
        return;
      }
    },
    { orgId, onError },
  );
}
