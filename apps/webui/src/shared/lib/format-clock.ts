import { isDateOnlyValue } from './time-zone';

const LOCALE = 'en-US';

function parseDate(value: string | number): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateValue(
  value: string | number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  if (typeof value === 'string' && isDateOnlyValue(value)) {
    const date = parseDate(`${value}T00:00:00.000Z`);
    return date ? date.toLocaleDateString(LOCALE, { ...options, timeZone: 'UTC' }) : value;
  }
  const date = parseDate(value);
  return date ? date.toLocaleDateString(LOCALE, { ...options, timeZone }) : String(value);
}

export function formatClock(iso: string | number, timeZone: string): string {
  const date = parseDate(iso);
  if (!date) {
    return String(iso);
  }
  return date.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}

export function formatClockSeconds(iso: string | number, timeZone: string): string {
  const date = parseDate(iso);
  if (!date) {
    return String(iso);
  }
  return date.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });
}

function joinDayAndTime(
  date: Date,
  timeZone: string,
  timeOptions: Intl.DateTimeFormatOptions,
): string {
  const day = date.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', timeZone });
  const time = date.toLocaleTimeString(LOCALE, { ...timeOptions, timeZone });
  return `${day} at ${time}`;
}

export function formatDayTime(iso: string | number, timeZone: string): string {
  const date = parseDate(iso);
  if (!date) {
    return String(iso);
  }
  return joinDayAndTime(date, timeZone, { hour: '2-digit', minute: '2-digit' });
}

export function formatShortDate(value: string | number, timeZone: string): string {
  return formatDateValue(value, timeZone, { month: 'short', day: 'numeric' });
}

export function formatFullDate(value: string | number, timeZone: string): string {
  return formatDateValue(value, timeZone, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value: string | number, timeZone: string): string {
  const date = parseDate(value);
  if (!date) {
    return String(value);
  }
  return joinDayAndTime(date, timeZone, { hour: 'numeric', minute: '2-digit' });
}

export function formatDayKey(dayKey: string): string {
  const date = parseDate(`${dayKey}T00:00:00.000Z`);
  if (!date) {
    return dayKey;
  }
  return date.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
