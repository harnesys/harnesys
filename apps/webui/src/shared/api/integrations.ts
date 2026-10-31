import type {
  DisconnectIntegrationResponse,
  GithubAppStatusResponse,
  GithubInstallStartResponse,
  GithubInstallStatusResponse,
  GithubManifestStartResponse,
  GithubReposResponse,
  GoogleOAuthService,
  IntegrationsListResponse,
} from '@harnesys/contracts';
import { queryOptions } from '@tanstack/react-query';
import { apiJson } from './client';

export type {
  ConnectorDescriptor,
  DisconnectIntegrationResponse,
  GithubAppStatusResponse,
  GithubInstallStartResponse,
  GithubInstallStatusResponse,
  GithubManifestStartResponse,
  GithubReposResponse,
  Integration,
  IntegrationsListResponse,
} from '@harnesys/contracts';

export interface GoogleOAuthStartResponse {
  flow: 'loopback';
  sessionId: string;
  authUrl: string;
  expiresIn: number;
}

export type GoogleOAuthStatusResponse =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'expired' }
  | { status: 'ready'; integrationId: string };

export interface GoogleAppConfigStatusResponse {
  configured: boolean;
  redirectUri: string;
  clientId: string;
  hasClientSecret: boolean;
  hasApiKey: boolean;
  hasAppId: boolean;
}

export interface GoogleAppConfigBody {
  clientId: string;
  clientSecret: string;
  apiKey: string;
  appId: string;
}

export interface GooglePickerSessionResponse {
  accessToken: string;
  apiKey: string;
  appId: string;
}

export function integrationsQueryKey(orgId: string) {
  return ['integrations', orgId] as const;
}

export function listIntegrations(orgId: string): Promise<IntegrationsListResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/integrations`);
}

export function integrationsQuery(orgId: string) {
  return queryOptions({
    queryKey: integrationsQueryKey(orgId),
    queryFn: () => listIntegrations(orgId),
    enabled: Boolean(orgId),
  });
}

export function disconnectIntegration(
  orgId: string,
  integrationId: string,
): Promise<DisconnectIntegrationResponse> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/integrations/${encodeURIComponent(integrationId)}`,
    { method: 'DELETE' },
  );
}

export function startGoogleOAuthLoopback(
  orgId: string,
  body: { services?: GoogleOAuthService[] } = {},
): Promise<GoogleOAuthStartResponse> {
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/integrations/google/oauth/loopback/start`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export function googleOAuthStatus(
  orgId: string,
  sessionId: string,
): Promise<GoogleOAuthStatusResponse> {
  const q = new URLSearchParams({ sessionId });
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/integrations/google/oauth/status?${q.toString()}`,
  );
}

export function googleAppStatus(orgId: string): Promise<GoogleAppConfigStatusResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/integrations/google/app`);
}

export function googleAppStatusQueryKey(orgId: string) {
  return ['integrations', orgId, 'google-app-status'] as const;
}

export function googleAppStatusQuery(orgId: string) {
  return queryOptions({
    queryKey: googleAppStatusQueryKey(orgId),
    queryFn: () => googleAppStatus(orgId),
    enabled: Boolean(orgId),
  });
}

export function saveGoogleAppConfig(
  orgId: string,
  body: GoogleAppConfigBody,
): Promise<GoogleAppConfigStatusResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/integrations/google/app`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function googlePickerSession(
  orgId: string,
  integrationId: string,
): Promise<GooglePickerSessionResponse> {
  const q = new URLSearchParams({ integrationId });
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/integrations/google/picker?${q.toString()}`,
  );
}

export function githubAppStatusQueryKey(orgId: string) {
  return ['integrations', orgId, 'github-app-status'] as const;
}

export function githubAppStatus(orgId: string): Promise<GithubAppStatusResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/integrations/github/app-status`);
}

export function githubAppStatusQuery(orgId: string) {
  return queryOptions({
    queryKey: githubAppStatusQueryKey(orgId),
    queryFn: () => githubAppStatus(orgId),
    enabled: Boolean(orgId),
  });
}

export function startGithubInstall(orgId: string): Promise<GithubInstallStartResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/integrations/github/install/start`, {
    method: 'POST',
  });
}

export function startGithubManifest(
  orgId: string,
  name: string,
): Promise<GithubManifestStartResponse> {
  return apiJson(`/api/orgs/${encodeURIComponent(orgId)}/integrations/github/manifest/start`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function githubInstallStatus(
  orgId: string,
  sessionId: string,
): Promise<GithubInstallStatusResponse> {
  const q = new URLSearchParams({ sessionId });
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/integrations/github/install/status?${q.toString()}`,
  );
}

export function githubReposQueryKey(orgId: string, integrationId: string) {
  return ['integrations', orgId, 'github-repos', integrationId] as const;
}

export function listGithubRepos(
  orgId: string,
  integrationId: string,
): Promise<GithubReposResponse> {
  const q = new URLSearchParams({ integrationId });
  return apiJson(
    `/api/orgs/${encodeURIComponent(orgId)}/integrations/github/repos?${q.toString()}`,
  );
}

export function githubReposQuery(orgId: string, integrationId: string) {
  return queryOptions({
    queryKey: githubReposQueryKey(orgId, integrationId),
    queryFn: () => listGithubRepos(orgId, integrationId),
    enabled: Boolean(orgId && integrationId),
  });
}
