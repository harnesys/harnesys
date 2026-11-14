import type { AddonContext } from '@harnesys/sdk';
import { clampInt, numberValue } from './numbers.ts';
import { type SendLimits, sendLimitsOf } from './send-limits.ts';

export interface AccountToolSettings {
  allowedChats: readonly string[];
  readOnly: boolean;
  joinAllowed: boolean;
  limits: SendLimits;
  maxHistoryLimit: number;
  maxDialogs: number;
  maxUploadMb: number;
  maxDownloadMb: number;
}

export const DEFAULT_MAX_HISTORY_LIMIT = 100;
export const DEFAULT_MAX_DIALOGS = 200;
export const DEFAULT_MAX_UPLOAD_MB = 20;
export const DEFAULT_MAX_DOWNLOAD_MB = 20;
export const DEFAULT_JOIN_ALLOWED = true;

const MAX_HISTORY_CAP = 1000;
const MAX_DIALOGS_CAP = 1000;
const MEDIA_MB_CAP = 50;

export const CONFIG_KEYS = [
  'allowed_chats',
  'read_only',
  'min_send_interval_ms',
  'max_sends_per_hour',
  'max_sends_per_day',
  'max_history_limit',
  'max_dialogs',
  'flood_wait_retries',
  'max_upload_mb',
  'max_download_mb',
  'join_allowed',
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

function booleanField(
  raw: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = raw[key];
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
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
    joinAllowed: booleanField(raw, 'join_allowed', DEFAULT_JOIN_ALLOWED),
    limits: sendLimitsOf(raw),
    maxHistoryLimit: positiveField(
      raw,
      'max_history_limit',
      DEFAULT_MAX_HISTORY_LIMIT,
      MAX_HISTORY_CAP,
    ),
    maxDialogs: positiveField(raw, 'max_dialogs', DEFAULT_MAX_DIALOGS, MAX_DIALOGS_CAP),
    maxUploadMb: positiveField(raw, 'max_upload_mb', DEFAULT_MAX_UPLOAD_MB, MEDIA_MB_CAP),
    maxDownloadMb: positiveField(raw, 'max_download_mb', DEFAULT_MAX_DOWNLOAD_MB, MEDIA_MB_CAP),
  };
}

export function maxUploadBytes(settings: AccountToolSettings): number {
  return settings.maxUploadMb * 1024 * 1024;
}

export function maxDownloadBytes(settings: AccountToolSettings): number {
  return settings.maxDownloadMb * 1024 * 1024;
}

export async function toolSettings(ctx: AddonContext): Promise<AccountToolSettings> {
  return settingsOf(await ctx.config.get([...CONFIG_KEYS]));
}