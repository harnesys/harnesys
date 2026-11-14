import { type AddonContext, AddonError, type ToolHandler } from '@harnesys/sdk';
import {
  calendarError,
  calendarFetch,
  calendarJson,
  calendarsUrl,
  eventsCollectionUrl,
  eventsUrl,
  eventUrl,
  PRIMARY_CALENDAR,
} from './calendar-client.ts';
import {
  type CalendarEventDraft,
  type CalendarEventSummary,
  type CalendarEventWire,
  type CalendarListEntryWire,
  type CalendarSummary,
  calendarSummaryOf,
  eventBodyOf,
  eventSummaryOf,
} from './calendar-events.ts';

const DEFAULT_LIST_MAX = 25;
const DEFAULT_CALENDARS_MAX = 100;
const MAX_RESULTS_LIMIT = 250;

interface EventCollectionWire {
  items?: CalendarEventWire[];
}

interface CalendarListWire {
  items?: CalendarListEntryWire[];
}

interface ListEventsResult {
  calendarId: string;
  events: CalendarEventSummary[];
}

const listCalendars: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const json = await calendarJson<CalendarListWire>(ctx, {
    ...accountOf(input),
    url: calendarsUrl(maxResultsOf(input, DEFAULT_CALENDARS_MAX)),
  });
  const calendars = (json.items ?? []).map(calendarSummaryOf);
  return { calendars } satisfies { calendars: CalendarSummary[] };
};

const listEvents: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const calendarId = calendarIdOf(input);
  const json = await calendarJson<EventCollectionWire>(ctx, {
    ...accountOf(input),
    url: eventsUrl(calendarId, {
      ...textParamsOf(input),
      maxResults: maxResultsOf(input, DEFAULT_LIST_MAX),
    }),
  });
  const events = (json.items ?? []).map(eventSummaryOf);
  return { calendarId, events } satisfies ListEventsResult;
};

const createEvent: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const calendarId = calendarIdOf(input);
  const draft: CalendarEventDraft = {
    summary: requiredTextOf(input, 'summary'),
    start: requiredTextOf(input, 'start'),
    end: requiredTextOf(input, 'end'),
    ...optionalDraftFieldsOf(input),
  };
  const event = await calendarJson<CalendarEventWire>(ctx, {
    ...accountOf(input),
    method: 'POST',
    url: eventsCollectionUrl(calendarId),
    body: JSON.stringify(eventBodyOf(draft)),
  });
  const summary = eventSummaryOf(event);
  await ctx.log.info('calendar event created', { calendarId, eventId: summary.id });
  return { calendarId, event: summary } satisfies {
    calendarId: string;
    event: CalendarEventSummary;
  };
};

const updateEvent: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const calendarId = calendarIdOf(input);
  const eventId = requiredTextOf(input, 'eventId');
  const draft = optionalDraftFieldsOf(input);
  if (Object.keys(draft).length === 0) {
    throw new AddonError('invalid_params', {
      detail:
        'nothing to update: pass at least one of summary, start, end, description, location, attendees',
    });
  }
  const event = await calendarJson<CalendarEventWire>(ctx, {
    ...accountOf(input),
    method: 'PATCH',
    url: eventUrl(calendarId, eventId),
    body: JSON.stringify(eventBodyOf(draft)),
  });
  const summary = eventSummaryOf(event);
  await ctx.log.info('calendar event updated', {
    calendarId,
    eventId: summary.id,
    fields: Object.keys(draft).join(','),
  });
  return { calendarId, event: summary } satisfies {
    calendarId: string;
    event: CalendarEventSummary;
  };
};

const deleteEvent: ToolHandler = async (input: Record<string, unknown>, ctx: AddonContext) => {
  const calendarId = calendarIdOf(input);
  const eventId = requiredTextOf(input, 'eventId');
  const result = await calendarFetch(ctx, {
    ...accountOf(input),
    method: 'DELETE',
    url: eventUrl(calendarId, eventId),
  });
  if (result.status < 200 || result.status >= 300) {
    throw calendarError(result.status, result.text);
  }
  await ctx.log.info('calendar event deleted', { calendarId, eventId });
  return { ok: true, calendarId, eventId } satisfies {
    ok: boolean;
    calendarId: string;
    eventId: string;
  };
};

export const calendarTools: Record<string, ToolHandler> = {
  list_calendars: listCalendars,
  list_events: listEvents,
  create_event: createEvent,
  update_event: updateEvent,
  delete_event: deleteEvent,
};

function accountOf(input: Record<string, unknown>): { accountId?: string } {
  const accountId = optionalTextOf(input, 'accountId');
  return accountId === undefined ? {} : { accountId };
}

function calendarIdOf(input: Record<string, unknown>): string {
  return optionalTextOf(input, 'calendarId') ?? PRIMARY_CALENDAR;
}

function maxResultsOf(input: Record<string, unknown>, fallback: number): number {
  const raw = input.maxResults;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return fallback;
  }
  return Math.min(Math.max(1, raw), MAX_RESULTS_LIMIT);
}

function textParamsOf(input: Record<string, unknown>): {
  timeMin?: string;
  timeMax?: string;
  query?: string;
} {
  const timeMin = optionalTextOf(input, 'timeMin');
  const timeMax = optionalTextOf(input, 'timeMax');
  const query = optionalTextOf(input, 'query');
  return {
    ...(timeMin === undefined ? {} : { timeMin }),
    ...(timeMax === undefined ? {} : { timeMax }),
    ...(query === undefined ? {} : { query }),
  };
}

function optionalDraftFieldsOf(input: Record<string, unknown>): CalendarEventDraft {
  const description = optionalTextOf(input, 'description');
  const location = optionalTextOf(input, 'location');
  const start = optionalTextOf(input, 'start');
  const end = optionalTextOf(input, 'end');
  const summary = optionalTextOf(input, 'summary');
  const attendees = emailsOf(input.attendees);
  return {
    ...(description === undefined ? {} : { description }),
    ...(location === undefined ? {} : { location }),
    ...(start === undefined ? {} : { start }),
    ...(end === undefined ? {} : { end }),
    ...(summary === undefined ? {} : { summary }),
    ...(attendees === undefined ? {} : { attendees }),
  };
}

function emailsOf(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new AddonError('invalid_params', { detail: 'attendees must be an array of emails' });
  }
  const emails = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry !== '',
  );
  if (emails.length !== value.length) {
    throw new AddonError('invalid_params', { detail: 'attendees must contain only email strings' });
  }
  return emails;
}

function requiredTextOf(input: Record<string, unknown>, key: string): string {
  const value = optionalTextOf(input, key);
  if (value === undefined) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalTextOf(input: Record<string, unknown>, key: string): string | undefined {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (typeof raw !== 'string') {
    throw new AddonError('invalid_params', { detail: `${key} must be a string` });
  }
  return raw === '' ? undefined : raw;
}
