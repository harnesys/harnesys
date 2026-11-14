import { describe, expect, test } from 'bun:test';
import type { AddonErrorReason } from '@harnesys/sdk';
import { floodWaitSeconds, mapTelegramError } from './tool-errors.ts';

function rpc(errorMessage: string): unknown {
  return { errorMessage };
}

describe('telegram error mapping', () => {
  test('turns FLOOD_WAIT into a retryable rate_limited with retry_after', () => {
    expect(floodWaitSeconds(rpc('FLOOD_WAIT_12'))).toBe(12);
    const mapped = mapTelegramError(rpc('FLOOD_WAIT_12'));
    expect(mapped.reason).toBe('rate_limited');
    expect(mapped.retryable).toBe(true);
    expect(mapped.detail).toContain('retry_after 12s');
    expect(mapped.detail).toContain('FLOOD_WAIT_12');
  });

  test('maps chat, peer, session and param errors to add-on reasons', () => {
    const expectations: Array<[string, AddonErrorReason]> = [
      ['CHAT_WRITE_FORBIDDEN', 'permission_denied'],
      ['CHANNEL_PRIVATE', 'permission_denied'],
      ['PEER_ID_INVALID', 'not_found'],
      ['AUTH_KEY_UNREGISTERED', 'account_failed'],
      ['MESSAGE_TOO_LONG', 'invalid_params'],
    ];
    for (const [message, reason] of expectations) {
      const mapped = mapTelegramError(rpc(message));
      expect(mapped.reason).toBe(reason);
      expect(mapped.detail).toContain(message);
    }
  });
});
