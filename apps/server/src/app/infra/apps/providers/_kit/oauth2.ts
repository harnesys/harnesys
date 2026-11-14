import { ProviderError } from '../../../../domain/apps/errors.ts';
import type { ProviderHttp } from '../../../../domain/apps/provider-module.ts';
import { classifyHttp } from './http-classify.ts';

export type ClientAuthStyle = 'body' | 'basic';

export interface OAuthEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
}

export interface AuthorizeInput {
  endpoints: OAuthEndpoints;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge?: string;
  extra?: Record<string, string>;
}

export interface TokenExchangeInput {
  endpoints: OAuthEndpoints;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  authStyle?: ClientAuthStyle;
  extra?: Record<string, string>;
}

export interface RefreshInput {
  endpoints: OAuthEndpoints;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  authStyle?: ClientAuthStyle;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scopes: string[];
  tokenType: string | null;
  raw: Record<string, unknown>;
}

export function buildAuthorizeUrl(input: AuthorizeInput): string {
  const url = new URL(input.endpoints.authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  if (input.scopes.length > 0) {
    url.searchParams.set('scope', input.scopes.join(' '));
  }
  if (input.codeChallenge) {
    url.searchParams.set('code_challenge', input.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  for (const [key, value] of Object.entries(input.extra ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function exchangeCode(
  http: ProviderHttp,
  input: TokenExchangeInput,
  now: number,
): Promise<OAuthToken> {
  return tokenRequest(http, {
    endpoints: input.endpoints,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    authStyle: input.authStyle ?? 'body',
    form: {
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      ...(input.codeVerifier ? { code_verifier: input.codeVerifier } : {}),
      ...(input.extra ?? {}),
    },
    now,
  });
}

export async function refreshAccessToken(
  http: ProviderHttp,
  input: RefreshInput,
  now: number,
): Promise<OAuthToken> {
  return tokenRequest(http, {
    endpoints: input.endpoints,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    authStyle: input.authStyle ?? 'body',
    form: {
      grant_type: 'refresh_token',
      refresh_token: input.refreshToken,
    },
    now,
  });
}

interface TokenRequest {
  endpoints: OAuthEndpoints;
  clientId: string;
  clientSecret: string;
  authStyle: ClientAuthStyle;
  form: Record<string, string>;
  now: number;
}

async function tokenRequest(http: ProviderHttp, input: TokenRequest): Promise<OAuthToken> {
  const form: Record<string, string> = { ...input.form };
  if (input.authStyle === 'body') {
    form.client_id = input.clientId;
    form.client_secret = input.clientSecret;
  }
  const outcome = await http.send({
    method: 'POST',
    url: input.endpoints.tokenUrl,
    headers: { accept: 'application/json' },
    body: { form },
    ...(input.authStyle === 'basic'
      ? { basicAuth: { user: input.clientId, pass: input.clientSecret } }
      : {}),
  });
  const failure = classifyHttp(outcome);
  if (failure) {
    throw new ProviderError(failure);
  }
  if (outcome.kind !== 'ok' && outcome.kind !== 'http_error') {
    throw new ProviderError('invalid_response');
  }
  return normalizeToken(outcome.json, input.now);
}

export function normalizeToken(json: unknown, now: number): OAuthToken {
  if (!json || typeof json !== 'object') {
    throw new ProviderError('invalid_response');
  }
  const record = json as Record<string, unknown>;
  if (typeof record.access_token !== 'string' || record.access_token === '') {
    throw new ProviderError('invalid_response');
  }
  const expiresIn = typeof record.expires_in === 'number' ? record.expires_in : null;
  return {
    accessToken: record.access_token,
    refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : null,
    expiresAt: expiresIn === null ? null : now + expiresIn * 1000,
    scopes: typeof record.scope === 'string' ? record.scope.split(/[\s,]+/).filter(Boolean) : [],
    tokenType: typeof record.token_type === 'string' ? record.token_type : null,
    raw: record,
  };
}
