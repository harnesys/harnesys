export const DAILY_BUDGET_SCOPE = 'agent_day';
export const DAILY_BUDGET_FULL_PERCENT = 100;
export const DEFAULT_ORG_TIMEZONE = 'UTC';

export function dailyBudgetExceeded(budgetUsdDaily: number | null, spentUsd: number): boolean {
  if (budgetUsdDaily === null || budgetUsdDaily <= 0) {
    return false;
  }
  return spentUsd >= budgetUsdDaily;
}

export interface LocalDayRange {
  day: string;
  startIso: string;
  endIso: string;
  offsetMinutes: number;
}

interface ZonedClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(timezone: string | null | undefined): string {
  if (!timezone) {
    return DEFAULT_ORG_TIMEZONE;
  }
  return isValidTimeZone(timezone) ? timezone : DEFAULT_ORG_TIMEZONE;
}

function formatterOf(timezone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timezone);
  if (cached) {
    return cached;
  }
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  formatters.set(timezone, created);
  return created;
}

function clockOf(timezone: string, at: Date): ZonedClock {
  const values = new Map<string, string>();
  for (const part of formatterOf(timezone).formatToParts(at)) {
    if (part.type !== 'literal') {
      values.set(part.type, part.value);
    }
  }
  return {
    year: Number(values.get('year') ?? '0'),
    month: Number(values.get('month') ?? '1'),
    day: Number(values.get('day') ?? '1'),
    hour: Number(values.get('hour') ?? '0'),
    minute: Number(values.get('minute') ?? '0'),
    second: Number(values.get('second') ?? '0'),
  };
}

export function zoneOffsetMinutes(timezone: string, at: Date): number {
  const tz = normalizeTimeZone(timezone);
  const clock = clockOf(tz, at);
  const asUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  const atUtc = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((asUtc - atUtc) / 60000);
}

export function offsetModifierOf(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function localMidnightUtc(
  timezone: string,
  year: number,
  month: number,
  day: number,
  guessOffsetMinutes: number,
): number {
  const base = Date.UTC(year, month - 1, day);
  const candidates = new Set<number>();
  let candidate = base - guessOffsetMinutes * 60000;
  for (let step = 0; step < 4; step += 1) {
    candidates.add(candidate);
    const offset = zoneOffsetMinutes(timezone, new Date(candidate));
    const next = base - offset * 60000;
    candidates.add(next);
    if (next === candidate) {
      break;
    }
    candidate = next;
  }
  let best = candidate;
  let bestMinutes = Number.POSITIVE_INFINITY;
  for (const value of candidates) {
    const clock = clockOf(timezone, new Date(value));
    const minutes = clock.hour * 60 + clock.minute;
    if (minutes < bestMinutes) {
      bestMinutes = minutes;
      best = value;
    }
  }
  return best;
}

function nextLocalDate(clock: ZonedClock): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function localDateKey(clock: ZonedClock): string {
  return `${String(clock.year).padStart(4, '0')}-${String(clock.month).padStart(2, '0')}-${String(
    clock.day,
  ).padStart(2, '0')}`;
}

export function localDayRange(timezone: string, now: Date): LocalDayRange {
  const tz = normalizeTimeZone(timezone);
  const clock = clockOf(tz, now);
  const offset = zoneOffsetMinutes(tz, now);
  const startMs = localMidnightUtc(tz, clock.year, clock.month, clock.day, offset);
  const next = nextLocalDate(clock);
  const endGuess = zoneOffsetMinutes(tz, new Date(startMs));
  const endMs = localMidnightUtc(tz, next.year, next.month, next.day, endGuess);
  const start = new Date(startMs);
  const end = new Date(endMs <= startMs ? startMs + 24 * 60 * 60 * 1000 : endMs);
  return {
    day: localDateKey(clock),
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    offsetMinutes: offset,
  };
}
