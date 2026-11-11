import { AddonError } from '@harnesys/sdk';

export interface CalendarDateWire {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface CalendarAttendeeWire {
  email?: string;
  responseStatus?: string;
}

export interface CalendarEventWire {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  updated?: string;
  start?: CalendarDateWire;
  end?: CalendarDateWire;
  attendees?: CalendarAttendeeWire[];
}

export interface CalendarEventSummary {
  id: string;
  summary: string | null;
  description: string | null;
  location: string | null;
  status: string | null;
  htmlLink: string | null;
  updatedAt: string | null;
  start: string | null;
  end: string | null;
  timeZone: string | null;
  allDay: boolean;
  attendees: string[];
}

export interface CalendarListEntryWire {
  id?: string;
  summary?: string;
  description?: string;
  primary?: boolean;
  accessRole?: string;
  timeZone?: string;
}

export interface CalendarSummary {
  id: string;
  summary: string | null;
  description: string | null;
  primary: boolean;
  accessRole: string | null;
  timeZone: string | null;
}

export interface CalendarEventDraft {
  summary?: string;
  description?: string;
  location?: string;
  start?: string;
  end?: string;
  attendees?: string[];
}

export function eventSummaryOf(raw: CalendarEventWire): CalendarEventSummary {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new AddonError('invalid_response', { detail: 'Calendar event has no id' });
  }
  return {
    id: raw.id,
    summary: optionalText(raw.summary),
    description: optionalText(raw.description),
    location: optionalText(raw.location),
    status: optionalText(raw.status),
    htmlLink: optionalText(raw.htmlLink),
    updatedAt: optionalText(raw.updated),
    start: markOf(raw.start),
    end: markOf(raw.end),
    timeZone: optionalText(raw.start?.timeZone ?? raw.end?.timeZone),
    allDay: isAllDay(raw.start),
    attendees: attendeesOf(raw.attendees),
  };
}

export function calendarSummaryOf(raw: CalendarListEntryWire): CalendarSummary {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new AddonError('invalid_response', { detail: 'Calendar list entry has no id' });
  }
  return {
    id: raw.id,
    summary: optionalText(raw.summary),
    description: optionalText(raw.description),
    primary: raw.primary === true,
    accessRole: optionalText(raw.accessRole),
    timeZone: optionalText(raw.timeZone),
  };
}

export function eventBodyOf(draft: CalendarEventDraft): Record<string, unknown> {
  return {
    summary: draft.summary,
    ...(draft.description === undefined ? {} : { description: draft.description }),
    ...(draft.location === undefined ? {} : { location: draft.location }),
    ...(draft.start === undefined ? {} : { start: timeMarkOf(draft.start) }),
    ...(draft.end === undefined ? {} : { end: timeMarkOf(draft.end) }),
    ...(draft.attendees === undefined ? {} : { attendees: attendeesBodyOf(draft.attendees) }),
  };
}

function timeMarkOf(value: string): Record<string, string> {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? { date: value } : { dateTime: value };
}

function attendeesBodyOf(emails: string[]): Array<{ email: string }> {
  return emails.map((email) => ({ email }));
}

function markOf(marker: CalendarDateWire | undefined): string | null {
  if (marker === undefined) {
    return null;
  }
  return optionalText(marker.dateTime) ?? optionalText(marker.date);
}

function isAllDay(marker: CalendarDateWire | undefined): boolean {
  if (marker === undefined) {
    return false;
  }
  return optionalText(marker.date) !== null && optionalText(marker.dateTime) === null;
}

function attendeesOf(rows: CalendarAttendeeWire[] | undefined): string[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => optionalText(row.email))
    .filter((email): email is string => email !== null);
}

function optionalText(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value;
}
