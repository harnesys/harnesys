import type {
  GoogleCalendarEvent,
  GoogleCalendarEventInput,
  GoogleCalendarEventPatch,
  GoogleCalendarListQuery,
} from 'harnesys';
import { asGoogleRecord, googleApiJson, stringField } from './google-http.ts';

const CALENDAR_API_BASE = '/calendar/v3';
const DEFAULT_MAX_RESULTS = 25;
const MAX_RESULTS_LIMIT = 50;

export const PRIMARY_CALENDAR_ID = 'primary';

export interface CalendarEventsQueryParams {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
}

export function calendarEventsQuery(params: CalendarEventsQueryParams): URLSearchParams {
  const query = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(
      Math.min(Math.max(1, params.maxResults ?? DEFAULT_MAX_RESULTS), MAX_RESULTS_LIMIT),
    ),
  });
  if (params.timeMin !== undefined && params.timeMin !== '') {
    query.set('timeMin', params.timeMin);
  }
  if (params.timeMax !== undefined && params.timeMax !== '') {
    query.set('timeMax', params.timeMax);
  }
  if (params.query !== undefined && params.query !== '') {
    query.set('q', params.query);
  }
  return query;
}

export async function listCalendarEvents(
  token: string,
  calendarId: string,
  params: GoogleCalendarListQuery,
): Promise<GoogleCalendarEvent[]> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'GET',
    path: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    query: calendarEventsQuery(params),
  });
  const items = Array.isArray(res.items) ? res.items : [];
  return items.map((item) => calendarEventOf(asGoogleRecord(item)));
}

export async function createCalendarEvent(
  token: string,
  calendarId: string,
  input: GoogleCalendarEventInput,
): Promise<GoogleCalendarEvent> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'POST',
    path: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    body: eventBodyOf(input),
  });
  return calendarEventOf(res);
}

export async function patchCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
  patch: GoogleCalendarEventPatch,
): Promise<GoogleCalendarEvent> {
  const res = await googleApiJson<Record<string, unknown>>({
    token,
    method: 'PATCH',
    path: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    body: eventPatchBodyOf(patch),
  });
  return calendarEventOf(res);
}

export async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  await googleApiJson<undefined>({
    token,
    method: 'DELETE',
    path: `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
  });
}

export function calendarEventOf(raw: Record<string, unknown>): GoogleCalendarEvent {
  const start = asGoogleRecord(raw.start);
  const end = asGoogleRecord(raw.end);
  return {
    id: stringField(raw, 'id') ?? '',
    summary: stringField(raw, 'summary'),
    description: stringField(raw, 'description'),
    location: stringField(raw, 'location'),
    start: dateOf(start),
    end: dateOf(end),
    attendees: attendeesOf(raw),
    status: stringField(raw, 'status'),
    htmlLink: stringField(raw, 'htmlLink'),
    updatedAt: stringField(raw, 'updated'),
  };
}

function eventBodyOf(input: GoogleCalendarEventInput): Record<string, unknown> {
  return {
    summary: input.summary,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    start: { dateTime: input.start },
    end: { dateTime: input.end },
    ...(input.attendees !== undefined
      ? { attendees: input.attendees.map((email) => ({ email })) }
      : {}),
  };
}

function eventPatchBodyOf(patch: GoogleCalendarEventPatch): Record<string, unknown> {
  return {
    ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.location !== undefined ? { location: patch.location } : {}),
    ...(patch.start !== undefined ? { start: { dateTime: patch.start } } : {}),
    ...(patch.end !== undefined ? { end: { dateTime: patch.end } } : {}),
    ...(patch.attendees !== undefined
      ? { attendees: patch.attendees.map((email) => ({ email })) }
      : {}),
  };
}

function dateOf(marker: Record<string, unknown>): string | null {
  return stringField(marker, 'dateTime') ?? stringField(marker, 'date');
}

function attendeesOf(raw: Record<string, unknown>): string[] {
  if (!Array.isArray(raw.attendees)) {
    return [];
  }
  return raw.attendees
    .map((entry) => stringField(asGoogleRecord(entry), 'email'))
    .filter((email) => email !== null);
}
