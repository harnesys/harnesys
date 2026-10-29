import { Cron } from 'croner';
import { normalizeTimeZone } from '../../domain/usage/daily-budget.ts';

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
