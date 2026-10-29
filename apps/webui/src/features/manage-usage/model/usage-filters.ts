import type { UsageGroupBy } from '@/entities/usage';
import { startOfDayInTimeZone } from '@/shared/lib/time-zone';

export const USAGE_GROUP_OPTIONS: { value: UsageGroupBy; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'hour', label: 'Hour' },
  { value: 'minute', label: 'Minute' },
  { value: 'agent', label: 'Agent' },
];

export const USAGE_RANGE_PRESETS = [1, 7, 30, 90] as const;
export type UsageRangePreset = (typeof USAGE_RANGE_PRESETS)[number];

const DAY_MS = 86_400_000;

export function usageRangeFromPreset(
  preset: UsageRangePreset,
  timeZone: string,
  now: Date = new Date(),
): { from: string; to: string } {
  if (preset === 1) {
    return { from: new Date(now.getTime() - DAY_MS).toISOString(), to: now.toISOString() };
  }
  const anchor = new Date(now.getTime() - (preset - 1) * DAY_MS);
  return { from: startOfDayInTimeZone(timeZone, anchor), to: now.toISOString() };
}

export function groupAllowedForPreset(group: UsageGroupBy, preset: number): boolean {
  if (group === 'minute') {
    return preset === 1;
  }
  if (group === 'hour') {
    return preset <= 7;
  }
  return true;
}

export function coarsestGroupForPreset(preset: number): UsageGroupBy {
  if (preset === 1) {
    return 'minute';
  }
  if (preset <= 7) {
    return 'hour';
  }
  return 'day';
}
