const FALLBACK_TIME_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Europe/Warsaw',
  'Pacific/Auckland',
];

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isDateOnlyValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

let cachedBrowserTimeZone: string | null = null;

export function browserTimeZone(): string {
  if (cachedBrowserTimeZone) {
    return cachedBrowserTimeZone;
  }
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  cachedBrowserTimeZone = resolved && isValidTimeZone(resolved) ? resolved : 'UTC';
  return cachedBrowserTimeZone;
}

export function browserLocalDateFromDayKey(dayKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    return null;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function browserLocalDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function timeZoneOptions(): string[] {
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const source = supported.length > 0 ? supported : FALLBACK_TIME_ZONES;
  return [...new Set(['UTC', ...source])].sort();
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(timeZone: string, date: Date): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: string): number => {
    const part = parts.find((entry) => entry.type === type);
    const value = part ? Number.parseInt(part.value, 10) : Number.NaN;
    return Number.isNaN(value) ? 0 : value;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

export function dayKeyInTimeZone(timeZone: string, date: Date): string {
  const parts = zonedParts(timeZone, date);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

export function startOfDayIsoInTimeZone(timeZone: string, dayKey: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) {
    return null;
  }
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  let candidate = base - zoneOffsetMinutes(timeZone, new Date(base)) * 60000;
  for (let step = 0; step < 4; step += 1) {
    const next = base - zoneOffsetMinutes(timeZone, new Date(candidate)) * 60000;
    if (next === candidate) {
      break;
    }
    candidate = next;
  }
  return new Date(candidate).toISOString();
}

export function zoneOffsetMinutes(timeZone: string, date: Date): number {
  const parts = zonedParts(timeZone, date);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function startOfDayInTimeZone(timeZone: string, now: Date): string {
  const parts = zonedParts(timeZone, now);
  const base = Date.UTC(parts.year, parts.month - 1, parts.day);
  const candidates = new Set<number>();
  let candidate = base - zoneOffsetMinutes(timeZone, now) * 60000;
  for (let step = 0; step < 4; step += 1) {
    candidates.add(candidate);
    const next = base - zoneOffsetMinutes(timeZone, new Date(candidate)) * 60000;
    candidates.add(next);
    if (next === candidate) {
      break;
    }
    candidate = next;
  }
  let best = candidate;
  let bestMinutes = Number.POSITIVE_INFINITY;
  for (const value of candidates) {
    const local = zonedParts(timeZone, new Date(value));
    const minutes = local.hour * 60 + local.minute;
    if (minutes < bestMinutes) {
      bestMinutes = minutes;
      best = value;
    }
  }
  return new Date(best).toISOString();
}
