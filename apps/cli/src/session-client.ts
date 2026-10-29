import { fail, harnesysHome } from './paths.ts';
import { deleteSession, type StoredSession, writeSession } from './session-store.ts';

const REFRESH_COOKIE = 'harnesys.refresh';

type HeadersWithGetSetCookie = Headers & {
  getSetCookie?: () => string[];
};

interface HttpErrorBody {
  errorCode?: unknown;
  message?: unknown;
}

export function refreshCookieValue(response: Response): string | undefined {
  const headers = response.headers as HeadersWithGetSetCookie;
  const lines =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [response.headers.get('set-cookie') ?? ''];
  for (const line of lines) {
    const pair = line.split(';')[0];
    if (pair === undefined) {
      continue;
    }
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (name === REFRESH_COOKIE && value) {
      return value;
    }
  }
  return undefined;
}

async function rotateSession(session: StoredSession): Promise<StoredSession> {
  const relayUrl = session.relayUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${relayUrl}/api/session/refresh`, {
      method: 'POST',
      headers: { cookie: `${REFRESH_COOKIE}=${session.refreshToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    fail(`relay is not reachable at ${relayUrl}`);
  }
  if (!response.ok) {
    deleteSession(harnesysHome());
    fail(`session refresh failed — run: harnesys login ${relayUrl}`);
  }
  const body = (await response.json()) as {
    accessToken?: unknown;
    accessExpiresAt?: unknown;
  };
  if (typeof body.accessToken !== 'string' || typeof body.accessExpiresAt !== 'string') {
    fail('unexpected refresh response');
  }
  return {
    relayUrl: session.relayUrl,
    accessToken: body.accessToken,
    accessExpiresAt: body.accessExpiresAt,
    refreshToken: refreshCookieValue(response) ?? session.refreshToken,
  };
}

export async function fetchWithSession(
  session: StoredSession,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const build = (accessToken: string): RequestInit => ({
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const response = await fetch(url, build(session.accessToken));
  if (response.status !== 401) {
    return response;
  }
  const rotated = await rotateSession(session);
  writeSession(harnesysHome(), rotated);
  return await fetch(url, build(rotated.accessToken));
}

function parseErrorBody(text: string): { errorCode: string; message: string } | undefined {
  try {
    const parsed = JSON.parse(text) as HttpErrorBody;
    const errorCode = typeof parsed.errorCode === 'string' ? parsed.errorCode : '';
    const message = typeof parsed.message === 'string' ? parsed.message : '';
    if (errorCode || message) {
      return { errorCode, message };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function failHttp(context: string, response: Response): Promise<never> {
  const text = await response.text().catch(() => '');
  const parsed = parseErrorBody(text);
  if (!parsed) {
    return fail(`${context}: HTTP ${response.status} ${text.slice(0, 160)}`);
  }
  const message = parsed.message ? `${parsed.errorCode} — ${parsed.message}` : parsed.errorCode;
  return fail(`${context}: ${message}`);
}
