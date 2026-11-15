import { describe, expect, test } from 'bun:test';
import { AddonError } from '@harnesys/sdk';
import { scheduleSecondsOf } from './schedule.ts';
import { assertJoinAllowed } from './tool-access.ts';
import { albumItemsOf } from './tool-album.ts';
import { messageIdsOf, requiredMessageIds } from './tool-params.ts';
import { settingsOf } from './tool-settings.ts';

function reasonOf(run: () => unknown): string {
  try {
    run();
    return 'no-error';
  } catch (error) {
    return error instanceof AddonError ? error.reason : 'other-error';
  }
}

describe('tool call guards', () => {
  test('parses scheduleAt into unix seconds and rejects past or broken values', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(scheduleSecondsOf('2026-01-01T00:10:00Z', now)).toBe(1_767_226_200);
    expect(scheduleSecondsOf(undefined, now)).toBeUndefined();
    expect(reasonOf(() => scheduleSecondsOf('2025-12-31T23:59:59Z', now))).toBe('invalid_params');
    expect(reasonOf(() => scheduleSecondsOf('next tuesday', now))).toBe('invalid_params');
    expect(reasonOf(() => scheduleSecondsOf(1_767_226_200, now))).toBe('invalid_params');
  });

  test('caps albums at ten items and message id lists at a hundred', () => {
    const item = (index: number): { source: string } => ({ source: `a${index}.png` });
    const ten = Array.from({ length: 10 }, (_value, index) => item(index));
    const eleven = [...ten, item(11)];
    expect(albumItemsOf({ items: ten }, 'items')).toHaveLength(10);
    expect(reasonOf(() => albumItemsOf({ items: eleven }, 'items'))).toBe('invalid_params');
    expect(reasonOf(() => albumItemsOf({ items: [item(1)] }, 'items'))).toBe('invalid_params');
    expect(reasonOf(() => albumItemsOf({}, 'items'))).toBe('invalid_params');

    const hundred = Array.from({ length: 100 }, (_value, index) => index + 1);
    expect(messageIdsOf({ messageIds: hundred }, 'messageIds', 100)).toHaveLength(100);
    expect(reasonOf(() => messageIdsOf({ messageIds: [...hundred, 101] }, 'messageIds', 100))).toBe(
      'invalid_params',
    );
    expect(reasonOf(() => requiredMessageIds({}, 'messageIds', 100))).toBe('invalid_params');
    expect(reasonOf(() => messageIdsOf({ messageIds: [0] }, 'messageIds', 100))).toBe(
      'invalid_params',
    );
  });

  test('blocks join and leave when join_allowed is off', () => {
    const locked = settingsOf({ join_allowed: false });
    expect(locked.joinAllowed).toBe(false);
    expect(reasonOf(() => assertJoinAllowed(locked, 'join_chat'))).toBe('permission_denied');
    expect(reasonOf(() => assertJoinAllowed(locked, 'leave_chat'))).toBe('permission_denied');

    const open = settingsOf({});
    expect(open.joinAllowed).toBe(true);
    expect(assertJoinAllowed(open, 'join_chat')).toBeUndefined();
  });
});
