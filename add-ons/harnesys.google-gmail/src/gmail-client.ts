import { type AddonContext, AddonError } from '@harnesys/sdk';

export const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

const CONNECTION = 'google';

export interface GmailCall {
  accountId?: string;
  method?: 'GET' | 'POST';
  url: string;
  body?: string;
}

export interface GmailHttpResult {
  status: number;
  text: string | null;
}

function authOf(accountId: string | undefined): {
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

export async function gmailFetch(ctx: AddonContext, call: GmailCall): Promise<GmailHttpResult> {
  const response = await ctx.http.fetch({
    url: call.url,
    method: call.method ?? 'GET',
    headers: call.body === undefined ? {} : { 'content-type': 'application/json' },
    ...(call.body === undefined ? {} : { body: call.body }),
    auth: authOf(call.accountId),
  });
  return { status: response.status, text: response.body };
}

export async function gmailJson<T>(ctx: AddonContext, call: GmailCall): Promise<T> {
  const result = await gmailFetch(ctx, call);
  if (result.status < 200 || result.status >= 300) {
    throw gmailError(result.status, result.text);
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'Gmail returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'Gmail returned invalid JSON' });
  }
}

export function gmailError(status: number, body: string | null): AddonError {
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
  return new AddonError('invalid_response', { detail: `Gmail responded ${status}: ${detail}` });
}

export function decodeBase64Url(value: string): Uint8Array {
  return value === '' ? new Uint8Array(0) : Uint8Array.from(Buffer.from(value, 'base64url'));
}

export function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function errorDetail(body: string | null): string {
  if (body === null) {
    return 'no response body';
  }
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    const message = parsed.error?.message;
    if (typeof message === 'string') {
      return message;
    }
  } catch {
    return body.slice(0, 200);
  }
  return body.slice(0, 200);
}
