import { Cron } from 'croner';

const DEFAULT_TIMEZONE = 'UTC';

function isValidTimeZone(timezone: string | null | undefined): boolean {
  if (!timezone) {
    return false;
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(timezone: string | null | undefined): string {
  if (!timezone) {
    return DEFAULT_TIMEZONE;
  }
  return isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

export function nextCronRunAt(cron: string, from: Date, timezone: string): string {
  const job = new Cron(cron.trim(), { paused: true, timezone: normalizeTimeZone(timezone) });
  const next = job.nextRun(new Date(from.getTime() + 1));
  if (!next) {
    throw new Error(`cron has no next run: ${cron}`);
  }
  return next.toISOString();
}

export function isValidCron(cron: string, timezone: string): boolean {
  try {
    const job = new Cron(cron.trim(), { paused: true, timezone: normalizeTimeZone(timezone) });
    return job.nextRun() != null;
  } catch {
    return false;
  }
}
