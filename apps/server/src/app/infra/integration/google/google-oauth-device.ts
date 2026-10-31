const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';
export const GOOGLE_GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const GOOGLE_YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly';
export const GOOGLE_YOUTUBE_UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
export const GOOGLE_YOUTUBE_MANAGE_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export const GOOGLE_YT_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';
export const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const GOOGLE_DOCS_SCOPE = 'https://www.googleapis.com/auth/documents';
export const GOOGLE_SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const GOOGLE_USERINFO_PROFILE_SCOPE = 'https://www.googleapis.com/auth/userinfo.profile';
export const GOOGLE_USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
export const GOOGLE_OAUTH_SCOPES: readonly string[] = [
  GOOGLE_DRIVE_SCOPE,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_CALENDAR_SCOPE,
  GOOGLE_GMAIL_READONLY_SCOPE,
  GOOGLE_GMAIL_SEND_SCOPE,
  GOOGLE_YOUTUBE_READONLY_SCOPE,
  GOOGLE_YOUTUBE_UPLOAD_SCOPE,
  GOOGLE_YOUTUBE_MANAGE_SCOPE,
  GOOGLE_YT_ANALYTICS_READONLY_SCOPE,
  GOOGLE_SHEETS_SCOPE,
  GOOGLE_DOCS_SCOPE,
  GOOGLE_SEARCH_CONSOLE_SCOPE,
  GOOGLE_USERINFO_PROFILE_SCOPE,
  GOOGLE_USERINFO_EMAIL_SCOPE,
];
export const GOOGLE_OAUTH_SCOPE_PARAM = GOOGLE_OAUTH_SCOPES.join(' ');
export const GOOGLE_OAUTH_CALLBACK_PATH = '/api/integrations/google/callback';
export const GOOGLE_OAUTH_LOOPBACK_SESSION_TTL_MS = 10 * 60_000;

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope?: string;
  tokenType: string;
}

function tokenRequestBody(
  config: GoogleOAuthClientConfig,
  params: Record<string, string>,
): URLSearchParams {
  return new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...params,
  });
}

export async function refreshAccessToken(
  config: GoogleOAuthClientConfig,
  refreshToken: string,
): Promise<GoogleTokenSet> {
  const body = tokenRequestBody(config, {
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json: unknown = await res.json();
  const obj = asRecord(json);
  if (!res.ok || typeof obj.access_token !== 'string') {
    throw new Error(`Google refresh failed: ${res.status} ${JSON.stringify(json)}`);
  }
  return {
    accessToken: obj.access_token,
    refreshToken,
    expiresAt: Date.now() + Number(obj.expires_in ?? 3600) * 1000,
    scope: typeof obj.scope === 'string' ? obj.scope : undefined,
    tokenType: String(obj.token_type ?? 'Bearer'),
  };
}

export interface LoopbackAuthorizationInput {
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  challenge: string;
}

export function buildLoopbackAuthorizationUrl(input: LoopbackAuthorizationInput): string {
  const query = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: input.scope ?? GOOGLE_OAUTH_SCOPE_PARAM,
    access_type: 'offline',
    prompt: 'consent',
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTH_URL}?${query.toString()}`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function createPkceVerifier(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(96)));
}

export async function pkceChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export function createOAuthState(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

export interface LoopbackCodeExchangeInput {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
}

export async function exchangeLoopbackCode(
  input: LoopbackCodeExchangeInput,
): Promise<GoogleTokenSet> {
  const body = tokenRequestBody(
    { clientId: input.clientId, clientSecret: input.clientSecret },
    {
      code: input.code,
      code_verifier: input.verifier,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
    },
  );
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json: unknown = await res.json();
  const obj = asRecord(json);
  if (!res.ok || typeof obj.access_token !== 'string') {
    throw new Error(`Google code exchange failed: ${res.status} ${JSON.stringify(json)}`);
  }
  if (typeof obj.refresh_token !== 'string' || !obj.refresh_token) {
    throw new Error('Google did not return a refresh token; retry with consent');
  }
  return {
    accessToken: obj.access_token,
    refreshToken: obj.refresh_token,
    expiresAt: Date.now() + Number(obj.expires_in ?? 3600) * 1000,
    scope: typeof obj.scope === 'string' ? obj.scope : undefined,
    tokenType: String(obj.token_type ?? 'Bearer'),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}
