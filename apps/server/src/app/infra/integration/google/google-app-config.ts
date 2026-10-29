import { IntegrationNotConfiguredException } from '../../../domain/integration/integration.error.ts';
import { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { GOOGLE_OAUTH_CALLBACK_PATH, type GoogleOAuthClientConfig } from './google-oauth-device.ts';

export const GOOGLE_APP_CONFIG_KEY = 'cloud:google-client';

export interface GoogleAppConfig extends GoogleOAuthClientConfig {
  apiKey: string;
  appId: string;
}

export interface GoogleRedirectConfig {
  harnesys?: { publicUrl?: string };
  server?: { port?: number };
}

export async function loadGoogleAppConfig(
  secrets: SecretStorePort,
  orgId: string,
): Promise<GoogleAppConfig | null> {
  const raw = await secrets.get(orgId, GOOGLE_APP_CONFIG_KEY);
  if (!raw) {
    return null;
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  const obj = parsed as Record<string, unknown>;
  const clientId = typeof obj.clientId === 'string' ? obj.clientId.trim() : '';
  const clientSecret = typeof obj.clientSecret === 'string' ? obj.clientSecret.trim() : '';
  if (!clientId || !clientSecret) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    apiKey: typeof obj.apiKey === 'string' ? obj.apiKey.trim() : '',
    appId: typeof obj.appId === 'string' ? obj.appId.trim() : '',
  };
}

export async function saveGoogleAppConfig(
  secrets: SecretStorePort,
  orgId: string,
  config: GoogleAppConfig,
): Promise<void> {
  await secrets.set(orgId, GOOGLE_APP_CONFIG_KEY, JSON.stringify(config));
}

export async function requireGoogleAppConfig(
  secrets: SecretStorePort,
  orgId: string,
): Promise<GoogleAppConfig> {
  const config = await loadGoogleAppConfig(secrets, orgId);
  if (!config) {
    throw new IntegrationNotConfiguredException(
      'Connect your Google Cloud app in Settings → Connectors → Google first',
    );
  }
  return config;
}

export function googleRedirectUri(config: GoogleRedirectConfig): string {
  const publicUrl = config.harnesys?.publicUrl?.trim().replace(/\/+$/, '');
  if (publicUrl) {
    return `${publicUrl}${GOOGLE_OAUTH_CALLBACK_PATH}`;
  }
  return `http://127.0.0.1:${config.server?.port ?? 47474}${GOOGLE_OAUTH_CALLBACK_PATH}`;
}
