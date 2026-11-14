import { clampInt, numberValue } from './numbers.ts';

export interface SendLimits {
  minIntervalMs: number;
  maxPerHour: number;
  maxPerDay: number;
  floodWaitRetries: number;
}

export const DEFAULT_SEND_LIMITS: SendLimits = {
  minIntervalMs: 2000,
  maxPerHour: 20,
  maxPerDay: 150,
  floodWaitRetries: 0,
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export type SendLimitReason = 'interval' | 'hour' | 'day';

export interface SendVerdict {
  allowed: boolean;
  reason: SendLimitReason | null;
  retryAfterSec: number;
}

export interface SendWindowInput {
  recent: readonly string[];
  chatRecent: readonly string[];
  now: Date;
}

function numberField(raw: Record<string, unknown>, key: string, fallback: number): number {
  const parsed = numberValue(raw[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sendLimitsOf(raw: Record<string, unknown>): SendLimits {
  return {
    minIntervalMs: clampInt(
      numberField(raw, 'min_send_interval_ms', DEFAULT_SEND_LIMITS.minIntervalMs),
      0,
      600_000,
    ),
    maxPerHour: clampInt(
      numberField(raw, 'max_sends_per_hour', DEFAULT_SEND_LIMITS.maxPerHour),
      1,
      1000,
    ),
    maxPerDay: clampInt(
      numberField(raw, 'max_sends_per_day', DEFAULT_SEND_LIMITS.maxPerDay),
      1,
      10_000,
    ),
    floodWaitRetries: clampInt(
      numberField(raw, 'flood_wait_retries', DEFAULT_SEND_LIMITS.floodWaitRetries),
      0,
      3,
    ),
  };
}

function timestamps(values: readonly string[]): number[] {
  return values
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left);
}

function retryAfterSec(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

const ALLOWED: SendVerdict = { allowed: true, reason: null, retryAfterSec: 0 };

export function checkSendWindow(limits: SendLimits, input: SendWindowInput): SendVerdict {
  const nowMs = input.now.getTime();
  const chatTimes = timestamps(input.chatRecent);
  const lastChatSend = chatTimes[0];
  if (lastChatSend !== undefined) {
    const elapsed = nowMs - lastChatSend;
    if (elapsed < limits.minIntervalMs) {
      return {
        allowed: false,
        reason: 'interval',
        retryAfterSec: retryAfterSec(limits.minIntervalMs - elapsed),
      };
    }
  }
  const recent = timestamps(input.recent);
  const inHour = recent.filter((at) => nowMs - at < HOUR_MS);
  if (inHour.length >= limits.maxPerHour) {
    const oldest = inHour[inHour.length - 1] ?? nowMs;
    return {
      allowed: false,
      reason: 'hour',
      retryAfterSec: retryAfterSec(HOUR_MS - (nowMs - oldest)),
    };
  }
  const inDay = recent.filter((at) => nowMs - at < DAY_MS);
  if (inDay.length >= limits.maxPerDay) {
    const oldest = inDay[inDay.length - 1] ?? nowMs;
    return {
      allowed: false,
      reason: 'day',
      retryAfterSec: retryAfterSec(DAY_MS - (nowMs - oldest)),
    };
  }
  return ALLOWED;
}
