import { type AddonContext, AddonError } from '@harnesys/sdk';

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
export const PRIMARY_CALENDAR = 'primary';

const CONNECTION = 'google';
const DEFAULT_EVENT_FIELDS =
  'id,summary,description,location,status,htmlLink,updated,start,end,attendees';

export interface CalendarCall {
  accountId?: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  body?: string;
}

export interface CalendarHttpResult {
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

export async function calendarFetch(
  ctx: AddonContext,
  call: CalendarCall,
): Promise<CalendarHttpResult> {
  const response = await ctx.http.fetch({
    url: call.url,
    method: call.method ?? 'GET',
    headers: call.body === undefined ? {} : { 'content-type': 'application/json' },
    ...(call.body === undefined ? {} : { body: call.body }),
    auth: authOf(call.accountId),
  });
  return { status: response.status, text: response.body };
}

export async function calendarJson<T>(ctx: AddonContext, call: CalendarCall): Promise<T> {
  const result = await calendarFetch(ctx, call);
  if (result.status < 200 || result.status >= 300) {
    throw calendarError(result.status, result.text);
  }
  if (result.text === null) {
    throw new AddonError('invalid_response', { detail: 'Calendar returned an empty body' });
  }
  try {
    return JSON.parse(result.text) as T;
  } catch {
    throw new AddonError('invalid_response', { detail: 'Calendar returned invalid JSON' });
  }
}

export function calendarsUrl(maxResults: number): string {
  const url = new URL(`${CALENDAR_API}/users/me/calendarList`);
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('minAccessRole', 'reader');
  url.searchParams.set('fields', 'items(id,summary,description,primary,accessRole,timeZone)');
  return url.toString();
}

export interface EventsQuery {
  timeMin?: string;
  timeMax?: string;
  query?: string;
  maxResults: number;
}

export function eventsUrl(calendarId: string, query: EventsQuery): string {
  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', String(query.maxResults));
  url.searchParams.set('fields', `items(${DEFAULT_EVENT_FIELDS})`);
  if (query.timeMin !== undefined) {
    url.searchParams.set('timeMin', query.timeMin);
  }
  if (query.timeMax !== undefined) {
    url.searchParams.set('timeMax', query.timeMax);
  }
  if (query.query !== undefined) {
    url.searchParams.set('q', query.query);
  }
  return url.toString();
}

export function eventsCollectionUrl(calendarId: string): string {
  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('fields', DEFAULT_EVENT_FIELDS);
  return url.toString();
}

export function eventUrl(calendarId: string, eventId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
}

export function calendarError(status: number, body: string | null): AddonError {
  const detail = errorDetail(body);
  if (status === 401) {
    return new AddonError('account_failed', {
      detail: `Google rejected the account credentials: ${detail}`,
      accountCode: 'invalid_credentials',
    });
  }
  if (status === 403 && /quota|rateLimitExceeded|userRateLimitExceeded/i.test(detail)) {
    return new AddonError('rate_limited', { detail, retryable: true });
  }
  if (status === 403) {
    return new AddonError('permission_denied', { detail });
  }
  if (status === 404 || status === 410) {
    return new AddonError('not_found', { detail });
  }
  if (status === 409) {
    return new AddonError('conflict', { detail });
  }
  return new AddonError('invalid_response', { detail: `Calendar responded ${status}: ${detail}` });
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
