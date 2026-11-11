import { type AddonContext, AddonError } from '@harnesys/sdk';

export const SHEETS_API = 'https://www.googleapis.com/sheets/v4';

const CONNECTION = 'google';

export interface SheetsCall {
  accountId?: string;
  method?: 'GET' | 'POST' | 'PUT';
  url: string;
  body?: string;
}

export interface SheetsHttpResult {
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

export async function sheetsFetch(ctx: AddonContext, call: SheetsCall): Promise<SheetsHttpResult> {
  const response = await ctx.http.fetch({
    url: call.url,
    method: call.method ?? 'GET',
    headers: call.body === undefined ? {} : { 'content-type': 'application/json' },
    ...(call.body === undefined ? {} : { body: call.body }),
    auth: authOf(call.accountId),
  });
  return { status: response.status, text: response.body };
}

export async function sheetsJson<T>(ctx: AddonContext, call: SheetsCall): Promise<T> {
  const result = await sheetsFetch(ctx, call);
  if (result.status < 200 || result.status >= 300) {
    throw sheetsError(result.status, result.text);
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'Sheets returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'Sheets returned invalid JSON' });
  }
}

export function sheetsError(status: number, body: string | null): AddonError {
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
  return new AddonError('invalid_response', { detail: `Sheets responded ${status}: ${detail}` });
}

export function spreadsheetUrl(spreadsheetId: string, suffix: string): string {
  return `${SHEETS_API}/spreadsheets/${encodeURIComponent(spreadsheetId)}${suffix}`;
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
