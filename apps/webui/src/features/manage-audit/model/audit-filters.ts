import type { OrgAuditQuery } from '@/shared/api/org-audit';
import { startOfDayInTimeZone } from '@/shared/lib/time-zone';

export const AUDIT_RANGE_PRESETS: readonly AuditRangePreset[] = [1, 7, 30, 90];
export type AuditRangePreset = 1 | 7 | 30 | 90;

export const AUDIT_ACTOR_KIND_FILTERS = ['all', 'user', 'system', 'anonymous', 'public'] as const;

export const AUDIT_RESULT_FILTERS = [
  'all',
  'ok',
  'denied',
  'failed',
  'accepted',
  'removed',
  'ready',
  'late',
  'family_revoked',
] as const;

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

export interface AuditFilterOption {
  value: string;
  label: string;
}

function filterOptions(values: readonly string[]): AuditFilterOption[] {
  return values.map((value) => ({
    value,
    label: value === 'all' ? 'All' : value,
  }));
}

export const AUDIT_ACTOR_KIND_OPTIONS = filterOptions(AUDIT_ACTOR_KIND_FILTERS);
export const AUDIT_RESULT_OPTIONS = filterOptions(AUDIT_RESULT_FILTERS);

export interface AuditFilterState {
  preset: AuditRangePreset;
  range: { from: string; to: string };
  actorKind: string;
  result: string;
  q: string;
}

export function auditQueryFromFilters(
  filters: AuditFilterState,
  limit?: number,
  offset?: number,
): OrgAuditQuery {
  const q = filters.q.trim();
  return {
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
    from: filters.range.from,
    to: filters.range.to,
    actorKind: filters.actorKind !== 'all' ? filters.actorKind : undefined,
    result: filters.result !== 'all' ? filters.result : undefined,
    q: q.length > 0 ? q : undefined,
  };
}
