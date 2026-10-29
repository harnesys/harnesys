import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { requireGoogleAppConfig } from './google-app-config.ts';
import {
  type GoogleOAuthClientConfig,
  type GoogleTokenSet,
  refreshAccessToken,
} from './google-oauth-device.ts';

export function googleCredKey(credRef: string): string {
  return `cloud:google:${credRef}`;
}

export async function loadGoogleTokens(
  secrets: SecretStorePort,
  orgId: string,
  credRef: string,
): Promise<GoogleTokenSet | null> {
  const raw = await secrets.get(orgId, googleCredKey(credRef));
  if (!raw) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.accessToken !== 'string' || typeof obj.refreshToken !== 'string') {
    return null;
  }
  return {
    accessToken: obj.accessToken,
    refreshToken: obj.refreshToken,
    expiresAt: Number(obj.expiresAt ?? 0),
    scope: typeof obj.scope === 'string' ? obj.scope : undefined,
    tokenType: String(obj.tokenType ?? 'Bearer'),
  };
}

export async function saveGoogleTokens(
  secrets: SecretStorePort,
  orgId: string,
  credRef: string,
  tokens: GoogleTokenSet,
): Promise<void> {
  await secrets.set(orgId, googleCredKey(credRef), JSON.stringify(tokens));
}

export async function loadGoogleOAuthClient(
  secrets: SecretStorePort,
  orgId: string,
): Promise<GoogleOAuthClientConfig> {
  const config = await requireGoogleAppConfig(secrets, orgId);
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

export type GoogleAccessTokenRefresher = (
  config: GoogleOAuthClientConfig,
  refreshToken: string,
) => Promise<GoogleTokenSet>;

export async function getValidGoogleAccessToken(
  secrets: SecretStorePort,
  orgId: string,
  credRef: string,
  config: GoogleOAuthClientConfig,
  refresh: GoogleAccessTokenRefresher = refreshAccessToken,
): Promise<string> {
  const tokens = await loadGoogleTokens(secrets, orgId, credRef);
  if (!tokens) {
    throw new Error(`Missing Google credentials: ${credRef}`);
  }
  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error('Google refresh token missing; re-run OAuth');
  }
  const refreshed = await refresh(config, tokens.refreshToken);
  await saveGoogleTokens(secrets, orgId, credRef, {
    ...refreshed,
    refreshToken: refreshed.refreshToken || tokens.refreshToken,
  });
  return refreshed.accessToken;
}
