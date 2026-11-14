import type { AddonContext } from '@harnesys/sdk';
import { clampInt, numberValue } from './numbers.ts';
import { type SendLimits, sendLimitsOf } from './send-limits.ts';

export interface AccountToolSettings {
  allowedChats: readonly string[];
  readOnly: boolean;
  limits: SendLimits;
  maxHistoryLimit: number;
  maxDialogs: number;
}

export const DEFAULT_MAX_HISTORY_LIMIT = 100;
export const DEFAULT_MAX_DIALOGS = 200;

const MAX_HISTORY_CAP = 1000;
const MAX_DIALOGS_CAP = 1000;

export const CONFIG_KEYS = [
  'allowed_chats',
  'read_only',
  'min_send_interval_ms',
  'max_sends_per_hour',
  'max_sends_per_day',
  'max_history_limit',
  'max_dialogs',
  'flood_wait_retries',
] as const;

function positiveField(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  cap: number,
): number {
  const parsed = numberValue(raw[key]);
  return Number.isFinite(parsed) ? clampInt(parsed, 1, cap) : fallback;
}

export function allowedChatsOf(raw: Record<string, unknown>): string[] {
  const value = raw.allowed_chats;
  if (typeof value !== 'string') {
    return [];
  }
  return dedupe(value);
}

function dedupe(value: string): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const entry of value.split(/[,\n]/)) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push(trimmed);
  }
  return entries;
}

export function settingsOf(raw: Record<string, unknown>): AccountToolSettings {
  return {
    allowedChats: allowedChatsOf(raw),
    readOnly: raw.read_only === true,
    limits: sendLimitsOf(raw),
    maxHistoryLimit: positiveField(
      raw,
      'max_history_limit',
      DEFAULT_MAX_HISTORY_LIMIT,
      MAX_HISTORY_CAP,
    ),
    maxDialogs: positiveField(raw, 'max_dialogs', DEFAULT_MAX_DIALOGS, MAX_DIALOGS_CAP),
  };
}

export async function toolSettings(ctx: AddonContext): Promise<AccountToolSettings> {
  return settingsOf(await ctx.config.get([...CONFIG_KEYS]));
}
