import { describe, expect, test } from 'bun:test';
import { DEFAULT_SEND_LIMITS } from './send-limits.ts';
import {
  DEFAULT_JOIN_ALLOWED,
  DEFAULT_MAX_DIALOGS,
  DEFAULT_MAX_DOWNLOAD_MB,
  DEFAULT_MAX_HISTORY_LIMIT,
  DEFAULT_MAX_UPLOAD_MB,
  settingsOf,
} from './tool-settings.ts';

describe('telegram account tool settings', () => {
  test('parses config over the documented defaults and caps numeric fields', () => {
    const defaults = settingsOf({});
    expect(defaults.allowedChats).toEqual([]);
    expect(defaults.readOnly).toBe(false);
    expect(defaults.joinAllowed).toBe(DEFAULT_JOIN_ALLOWED);
    expect(defaults.limits).toEqual(DEFAULT_SEND_LIMITS);
    expect(defaults.maxHistoryLimit).toBe(DEFAULT_MAX_HISTORY_LIMIT);
    expect(defaults.maxDialogs).toBe(DEFAULT_MAX_DIALOGS);
    expect(defaults.maxUploadMb).toBe(DEFAULT_MAX_UPLOAD_MB);
    expect(defaults.maxDownloadMb).toBe(DEFAULT_MAX_DOWNLOAD_MB);

    const settings = settingsOf({
      allowed_chats: ' @sales , -1001234567890\n@sales\n\n@ops ',
      read_only: true,
      min_send_interval_ms: '500',
      max_sends_per_hour: 5,
      max_history_limit: 5000,
      max_dialogs: '300',
    });
    expect(settings.allowedChats).toEqual(['@sales', '-1001234567890', '@ops']);
    expect(settings.readOnly).toBe(true);
    expect(settings.limits.minIntervalMs).toBe(500);
    expect(settings.limits.maxPerHour).toBe(5);
    expect(settings.maxHistoryLimit).toBe(1000);
    expect(settings.maxDialogs).toBe(300);
  });

  test('reads media and join fields, falls back on garbage and clamps the caps', () => {
    const tuned = settingsOf({
      max_upload_mb: '35',
      max_download_mb: 12,
      join_allowed: 'false',
    });
    expect(tuned.maxUploadMb).toBe(35);
    expect(tuned.maxDownloadMb).toBe(12);
    expect(tuned.joinAllowed).toBe(false);

    const garbage = settingsOf({
      max_upload_mb: 'huge',
      max_download_mb: null,
      join_allowed: 'maybe',
    });
    expect(garbage.maxUploadMb).toBe(DEFAULT_MAX_UPLOAD_MB);
    expect(garbage.maxDownloadMb).toBe(DEFAULT_MAX_DOWNLOAD_MB);
    expect(garbage.joinAllowed).toBe(DEFAULT_JOIN_ALLOWED);

    const clamped = settingsOf({ max_upload_mb: 900, max_download_mb: 0 });
    expect(clamped.maxUploadMb).toBe(50);
    expect(clamped.maxDownloadMb).toBe(1);
  });
});
