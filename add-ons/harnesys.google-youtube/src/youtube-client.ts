import { type AddonContext, AddonError } from '@harnesys/sdk';

export const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3';
export const YOUTUBE_ANALYTICS_API = 'https://www.googleapis.com/youtube/analytics/v2';

const CONNECTION = 'google';

export interface YoutubeCall {
  accountId?: string;
  method?: 'GET' | 'POST' | 'PUT';
  url: string;
  body?: string;
  bodyBase64?: string;
  headers?: Record<string, string>;
}

export interface YoutubeHttpResult {
  status: number;
  headers: Record<string, string>;
  text: string | null;
}

export function authOf(accountId: string | undefined): {
  connection: string;
  accountId?: string;
  scheme: 'bearer';
  credentialKey: string;
} {
  return {
    connection: CONNECTION,
    ...(accountId === undefined ? {} : { accountId }),
    scheme: 'bearer',
    credentialKey: 'accessToken',
  };
}

export async function youtubeFetch(
  ctx: AddonContext,
  call: YoutubeCall,
): Promise<YoutubeHttpResult> {
  const response = await ctx.http.fetch({
    url: call.url,
    method: call.method ?? 'GET',
    headers: requestHeaders(call),
    ...(call.body === undefined ? {} : { body: call.body }),
    ...(call.bodyBase64 === undefined ? {} : { bodyBase64: call.bodyBase64 }),
    auth: authOf(call.accountId),
  });
  return {
    status: response.status,
    headers: response.headers,
    text: response.body,
  };
}

export async function youtubeJson<T>(ctx: AddonContext, call: YoutubeCall): Promise<T> {
  const result = await youtubeFetch(ctx, call);
  if (result.status < 200 || result.status >= 300) {
    throw youtubeError(result.status, result.text);
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'YouTube returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'YouTube returned invalid JSON' });
  }
}

export function youtubeError(status: number, body: string | null): AddonError {
  const detail = errorDetail(body);
  if (status === 401) {
    return new AddonError('account_failed', {
      detail: `Google rejected the account credentials: ${detail}`,
      accountCode: 'invalid_credentials',
    });
  }
  if (status === 429 || (status === 403 && /quota|rateLimitExceeded/i.test(detail))) {
    return new AddonError('rate_limited', { detail, retryable: true });
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
  return new AddonError('invalid_response', { detail: `YouTube responded ${status}: ${detail}` });
}

export function headerOf(headers: Record<string, string>, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      return value;
    }
  }
  return undefined;
}

function requestHeaders(call: YoutubeCall): Record<string, string> {
  const headers: Record<string, string> = { ...(call.headers ?? {}) };
  if (typeof headers['content-type'] !== 'string' && call.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  return headers;
}

function errorDetail(body: string | null): string {
  if (body === null) {
    return 'no response body';
  }
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown; errors?: Array<{ reason?: unknown }> };
    };
    const message = parsed.error?.message;
    const reason = parsed.error?.errors?.[0]?.reason;
    if (typeof message === 'string') {
      return typeof reason === 'string' ? `${message} (${reason})` : message;
    }
  } catch {
    return body.slice(0, 200);
  }
  return body.slice(0, 200);
}
