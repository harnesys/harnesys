import { describe, expect, test } from 'bun:test';
import { DEFAULT_SEND_LIMITS } from './send-limits.ts';
import { DEFAULT_MAX_DIALOGS, DEFAULT_MAX_HISTORY_LIMIT, settingsOf } from './tool-settings.ts';

describe('telegram account tool settings', () => {
  test('parses config over the documented defaults and caps numeric fields', () => {
    const defaults = settingsOf({});
    expect(defaults.allowedChats).toEqual([]);
    expect(defaults.readOnly).toBe(false);
    expect(defaults.limits).toEqual(DEFAULT_SEND_LIMITS);
    expect(defaults.maxHistoryLimit).toBe(DEFAULT_MAX_HISTORY_LIMIT);
    expect(defaults.maxDialogs).toBe(DEFAULT_MAX_DIALOGS);

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
});
