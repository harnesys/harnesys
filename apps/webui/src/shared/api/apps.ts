import type {
  AccountResponse,
  AccountsListQuery,
  AccountsListResponse,
  AppKindsResponse,
  AppResponse,
  AppsListResponse,
  CreateAppBody,
  RegisterAccountBody,
  RegisterAccountResponse,
  UpdateAccountBody,
  UpdateAppBody,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

function orgPath(orgId: string, suffix: string): string {
  return `/api/orgs/${encodeURIComponent(orgId)}${suffix}`;
}

export function appsQueryKey(orgId: string) {
  return ['apps', orgId] as const;
}

export function appKindsQuery(orgId: string) {
  return queryOptions({
    queryKey: [...appsQueryKey(orgId), 'kinds'] as const,
    queryFn: () => apiJson<AppKindsResponse>(orgPath(orgId, '/app-kinds')),
    enabled: Boolean(orgId),
  });
}

export function appsQuery(orgId: string) {
  return queryOptions({
    queryKey: [...appsQueryKey(orgId), 'apps'] as const,
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
  return apiJson<void>(orgPath(orgId, `/apps/${encodeURIComponent(appId)}`), {
    method: 'DELETE',
  });
}

export function registerAccount(
  orgId: string,
  body: RegisterAccountBody,
): Promise<RegisterAccountResponse> {
  return apiJson<RegisterAccountResponse>(orgPath(orgId, '/accounts'), {
    method: 'POST',
    body: JSON.stringify(body),
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
