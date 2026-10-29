import type { CapabilityScope } from '../../domain/pack.ts';
import type {
  GoogleCalendarEventInput,
  GoogleCalendarEventPatch,
  GoogleCalendarListQuery,
  GoogleWorkspacePort,
} from '../../ports/google-workspace.ts';
import { type ToolDefinition, tool } from '../../ports/tools.ts';

export interface CreateCalendarToolsParams {
  google: GoogleWorkspacePort;
  resolveScope: () => CapabilityScope;
  integrationId: string;
}

interface CalendarListInput {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  query?: string;
}

interface CalendarCreateInput {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface CalendarUpdateInput {
  eventId: string;
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: string[];
}

interface CalendarDeleteInput {
  eventId: string;
}

export function createCalendarTools(deps: CreateCalendarToolsParams): ToolDefinition[] {
  return [
    tool('calendar_list_events', {
      group: 'google',
      description:
        'List Google Calendar events on the primary calendar (of the connected Google account). Filter by time range (RFC 3339) and free-text query.',
      input: {
        type: 'object',
        properties: {
          timeMin: { type: 'string', description: 'Lower bound (RFC 3339), inclusive' },
          timeMax: { type: 'string', description: 'Upper bound (RFC 3339), exclusive' },
          maxResults: { type: 'integer', minimum: 1, maximum: 50 },
          query: {
            type: 'string',
            description: 'Free-text search across summary/description/etc.',
          },
        },
      },
      sideEffect: 'read',
      execute: async (raw) =>
        runGuard(async () => {
          const input = (raw ?? {}) as CalendarListInput;
          const events = await deps.google.listEvents(
            deps.resolveScope(),
            deps.integrationId,
            listQueryOf(input),
          );
          return { events };
        }),
    }),
    tool('calendar_create_event', {
      group: 'google',
      description:
        'Create a Google Calendar event on the primary calendar. start/end are RFC 3339 date-times.',
      input: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          start: { type: 'string', description: 'Start date-time (RFC 3339)' },
          end: { type: 'string', description: 'End date-time (RFC 3339)' },
          description: { type: 'string' },
          location: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Email addresses' },
        },
        required: ['summary', 'start', 'end'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as CalendarCreateInput;
          const event = await deps.google.createEvent(
            deps.resolveScope(),
            deps.integrationId,
            eventInputOf(input),
          );
          return { event };
        }),
    }),
    tool('calendar_update_event', {
      group: 'google',
      description:
        'Update fields of a Google Calendar event (pass only the fields to change). Use calendar_list_events to find eventId.',
      input: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
          summary: { type: 'string' },
          start: { type: 'string', description: 'Start date-time (RFC 3339)' },
          end: { type: 'string', description: 'End date-time (RFC 3339)' },
          description: { type: 'string' },
          location: { type: 'string' },
          attendees: { type: 'array', items: { type: 'string' }, description: 'Replaces the list' },
        },
        required: ['eventId'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as CalendarUpdateInput;
          const event = await deps.google.updateEvent(
            deps.resolveScope(),
            deps.integrationId,
            input.eventId,
            updatePatchOf(input),
          );
          return { event };
        }),
    }),
    tool('calendar_delete_event', {
      group: 'google',
      description: 'Delete (cancel) a Google Calendar event by id.',
      input: {
        type: 'object',
        properties: { eventId: { type: 'string' } },
        required: ['eventId'],
      },
      sideEffect: 'credentialed',
      operations: ['google.write'],
      execute: async (raw) =>
        runGuard(async () => {
          const input = raw as CalendarDeleteInput;
          await deps.google.deleteEvent(deps.resolveScope(), deps.integrationId, input.eventId);
          return { ok: true, eventId: input.eventId };
        }),
    }),
  ];
}

function listQueryOf(input: CalendarListInput): GoogleCalendarListQuery {
  return {
    ...(input.timeMin !== undefined ? { timeMin: input.timeMin } : {}),
    ...(input.timeMax !== undefined ? { timeMax: input.timeMax } : {}),
    ...(input.maxResults !== undefined ? { maxResults: input.maxResults } : {}),
    ...(input.query !== undefined ? { query: input.query } : {}),
  };
}

function updatePatchOf(input: CalendarUpdateInput): GoogleCalendarEventPatch {
  return {
    ...(input.summary !== undefined ? { summary: input.summary } : {}),
    ...(input.start !== undefined ? { start: input.start } : {}),
    ...(input.end !== undefined ? { end: input.end } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.attendees !== undefined ? { attendees: input.attendees } : {}),
  };
}

function eventInputOf(input: CalendarCreateInput): GoogleCalendarEventInput {
  return {
    summary: input.summary,
    start: input.start,
    end: input.end,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.location !== undefined ? { location: input.location } : {}),
    ...(input.attendees !== undefined ? { attendees: input.attendees } : {}),
  };
}

async function runGuard<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
