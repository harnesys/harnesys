import { type AddonContext, AddonError } from '@harnesys/sdk';

export const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const JSON_ACCEPT = 'application/vnd.github+json';
const DIFF_ACCEPT = 'application/vnd.github.diff';
const MAX_DIFF_CHARS = 200_000;
const ERROR_EXCERPT_CHARS = 300;

export interface GithubCall {
  accountId?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  path: string;
  query?: URLSearchParams;
  body?: unknown;
  accept?: string;
  etag?: string;
}

export interface GithubResponse {
  status: number;
  headers: Record<string, string>;
  text: string | null;
}

/** Rate-limit error carrying the delay GitHub asked the caller to wait for. */
export class GithubRateLimitError extends AddonError {
  readonly retryAfterMs: number;

  constructor(detail: string, retryAfterMs: number) {
    super('rate_limited', { detail, retryable: true });
    this.name = 'GithubRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

function authOf(accountId: string | undefined): {
  connection: string;
  accountId?: string;
  scheme: 'bearer';
  credentialKey: string;
} {
  return {
    connection: 'github',
    ...(accountId === undefined ? {} : { accountId }),
    scheme: 'bearer',
    credentialKey: 'token',
  };
}

export async function githubRequest(ctx: AddonContext, call: GithubCall): Promise<GithubResponse> {
  const headers: Record<string, string> = {
    accept: call.accept ?? JSON_ACCEPT,
    'x-github-api-version': API_VERSION,
    'user-agent': 'harnesys',
  };
  if (call.etag !== undefined) {
    headers['if-none-match'] = call.etag;
  }
  const search = call.query?.toString();
  const response = await ctx.http.fetch({
    url: `${GITHUB_API}${call.path}${search === null || search === undefined || search === '' ? '' : `?${search}`}`,
    method: call.method ?? 'GET',
    headers,
    ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
    auth: authOf(call.accountId),
  });
  if (response.status === 429 || isSecondaryLimit(response.status, response.headers)) {
    throw rateLimitError(response.status, response.headers);
  }
  return { status: response.status, headers: response.headers, text: response.body };
}

export async function githubJson<T>(ctx: AddonContext, call: GithubCall): Promise<T> {
  const result = await githubRequest(ctx, call);
  if (result.status < 200 || result.status >= 300) {
    throw githubError(result.status, result.text);
  }
  if (result.status === 204) {
    return undefined as T;
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'GitHub returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'GitHub returned invalid JSON' });
  }
}

export async function githubText(ctx: AddonContext, call: GithubCall): Promise<string> {
  const result = await githubRequest(ctx, { ...call, accept: call.accept ?? DIFF_ACCEPT });
  if (result.status < 200 || result.status >= 300) {
    throw githubError(result.status, result.text);
  }
  return (result.text ?? '').slice(0, MAX_DIFF_CHARS);
}

/** GET that treats 304 as "nothing new"; returns null when the stored ETag still matches. */
export async function githubJsonConditional<T>(
  ctx: AddonContext,
  call: GithubCall,
): Promise<T | null> {
  const result = await githubRequest(ctx, call);
  if (result.status === 304) {
    return null;
  }
  if (result.status < 200 || result.status >= 300) {
    throw githubError(result.status, result.text);
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'GitHub returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'GitHub returned invalid JSON' });
  }
}

export function etagOf(headers: Record<string, string>): string | undefined {
  const value = headers.etag;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function githubError(status: number, body: string | null): AddonError {
  const detail = errorDetail(body);
  if (status === 401) {
    return new AddonError('account_failed', {
      detail: `GitHub rejected the installation credentials: ${detail}`,
      accountCode: 'invalid_credentials',
    });
  }
  if (status === 403) {
    return new AddonError('permission_denied', { detail });
  }
  if (status === 404) {
    return new AddonError('not_found', { detail });
  }
  if (status === 400 || status === 422) {
    return new AddonError('invalid_params', { detail });
  }
  return new AddonError('invalid_response', { detail: `GitHub responded ${status}: ${detail}` });
}

function isSecondaryLimit(status: number, headers: Record<string, string>): boolean {
  return status === 429 || headers['retry-after'] !== undefined;
}

function rateLimitError(status: number, headers: Record<string, string>): GithubRateLimitError {
  const retryAfter = retryAfterMsOf(headers);
  return new GithubRateLimitError(
    `GitHub rate limit reached (HTTP ${status}), retry after ${Math.round(retryAfter / 1000)}s`,
    retryAfter,
  );
}

function retryAfterMsOf(headers: Record<string, string>): number {
  const retryAfter = headers['retry-after'];
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  const reset = headers['x-ratelimit-reset'];
  if (reset !== undefined) {
    const resetAt = Number(reset);
    if (Number.isFinite(resetAt) && resetAt > 0) {
      return Math.max(0, resetAt * 1000 - Date.now());
    }
  }
  return 60_000;
}

function errorDetail(body: string | null): string {
  if (body === null) {
    return 'no response body';
  }
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (typeof parsed.message === 'string') {
      return parsed.message;
    }
  } catch {
    return body.slice(0, ERROR_EXCERPT_CHARS);
  }
  return body.slice(0, ERROR_EXCERPT_CHARS);
}
