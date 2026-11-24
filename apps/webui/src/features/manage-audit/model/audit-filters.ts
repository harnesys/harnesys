import type { OrgAuditQuery } from '@/shared/api/org-audit';
import { dayKeyInTimeZone, startOfDayInTimeZone, zoneOffsetMinutes } from '@/shared/lib/time-zone';

export const AUDIT_RANGE_PRESETS: readonly AuditRangePreset[] = [1, 7, 30, 90];
export type AuditRangePreset = 1 | 7 | 30 | 90;
export type AuditRangeSelection = AuditRangePreset | 'custom';
export const AUDIT_RANGE_CUSTOM = 'custom' as const;

export const AUDIT_SEARCH_DEBOUNCE_MS = 300;

const DAY_MS = 86_400_000;

export function auditRangeFromPreset(
  preset: AuditRangePreset,
  timeZone: string,
  now: Date = new Date(),
): { from: string; to: string } {
  if (preset === 1) {
    return { from: new Date(now.getTime() - DAY_MS).toISOString(), to: now.toISOString() };
  }
  const anchor = new Date(now.getTime() - (preset - 1) * DAY_MS);
  return { from: startOfDayInTimeZone(timeZone, anchor), to: now.toISOString() };
}

export function auditRangeFromCustom(
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  return {
    from: customFrom.length > 0 ? customFrom : undefined,
    to: customTo.length > 0 ? customTo : undefined,
  };
}

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function auditIsoFromDayTime(timeZone: string, dayKey: string, time: string): string {
  const dayMatch = DAY_KEY_PATTERN.exec(dayKey);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (dayMatch === null || timeMatch === null) {
    return new Date(0).toISOString();
  }
  const [, year, month, day] = dayMatch;
  const [, hours, minutes] = timeMatch;
  const utc = (offsetMinutes: number): number =>
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes)) -
    offsetMinutes * 60_000;
  const epoch = utc(zoneOffsetMinutes(timeZone, new Date(utc(0))));
  return new Date(epoch).toISOString();
}

export function auditDayTimeFromIso(
  timeZone: string,
  iso: string,
): { dayKey: string; time: string } {
  const date = new Date(iso);
  const dayKey = dayKeyInTimeZone(timeZone, date);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return { dayKey, time };
}

export function auditBoundaryDayKey(timeZone: string, iso: string): string | undefined {
  return iso.length > 0 ? dayKeyInTimeZone(timeZone, new Date(iso)) : undefined;
}

export interface AuditFilterOption {
  value: string;
  label: string;
}

export const AUDIT_ACTOR_KIND_OPTIONS: readonly AuditFilterOption[] = [
  { value: 'all', label: 'Any actor' },
  { value: 'user', label: 'User' },
  { value: 'system', label: 'System' },
  { value: 'anonymous', label: 'Anonymous' },
  { value: 'public', label: 'Public' },
];

export const AUDIT_RESULT_OPTIONS: readonly AuditFilterOption[] = [
  { value: 'all', label: 'Any result' },
  { value: 'ok', label: 'Succeeded' },
  { value: 'denied', label: 'Denied' },
  { value: 'failed', label: 'Failed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'removed', label: 'Removed' },
  { value: 'ready', label: 'Ready' },
  { value: 'late', label: 'Late' },
  { value: 'family_revoked', label: 'Access revoked' },
];

const RESULT_LABELS: Record<string, string> = Object.fromEntries(
  AUDIT_RESULT_OPTIONS.filter((option) => option.value !== 'all').map((option) => [
    option.value,
    option.label,
  ]),
);

export function auditResultLabel(result: string): string {
  return RESULT_LABELS[result] ?? result;
}

export interface AuditFilterState {
  preset: AuditRangeSelection;
  customFrom: string;
  customTo: string;
  actorKind: string;
  result: string;
  q: string;
}

export interface AuditRange {
  from?: string;
  to?: string;
}

export function auditRangeOf(
  filters: AuditFilterState,
  timeZone: string,
  now: Date = new Date(),
): AuditRange {
  if (filters.preset === AUDIT_RANGE_CUSTOM) {
    return auditRangeFromCustom(filters.customFrom, filters.customTo);
  }
  return auditRangeFromPreset(filters.preset, timeZone, now);
}

export function auditQueryFromFilters(
  filters: AuditFilterState,
  range: AuditRange,
  limit?: number,
  offset?: number,
): OrgAuditQuery {
  const q = filters.q.trim();
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
    from: range.from,
    to: range.to,
    actorKind: filters.actorKind !== 'all' ? filters.actorKind : undefined,
    result: filters.result !== 'all' ? filters.result : undefined,
    q: q.length > 0 ? q : undefined,
  };
}
