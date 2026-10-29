import { describe, expect, test } from 'bun:test';
import { COALESCE_MS, DRAFT_HEARTBEAT_MS, DRAFT_SPLIT_AT } from './constants.ts';
import { nextDraftTick, takeDraftChunk } from './draft-buffer.ts';
import { appEchoText, connectorOrigin, shouldEchoUser } from './echo.ts';
import { mapApprovalText } from './hitl-text.ts';
import { parseMirrorPatch } from './mirror-policy.ts';
import { createPairCode, pairCodeMatches } from './pair-code.ts';
import { parseTelegramUpdate } from './telegram-update.ts';

describe('connector pure decisions', () => {
  test('pair code matches until expiry and rejects empty or wrong hash', () => {
    const { code, hash } = createPairCode();
    expect(code).toHaveLength(8);
    expect(hash).toHaveLength(64);
    expect(pairCodeMatches(code, hash, 1_000, 999)).toBe(true);
    expect(pairCodeMatches(code, hash, 1_000, 1_000)).toBe(false);
    expect(pairCodeMatches('', hash, 1_000, 0)).toBe(false);
    expect(pairCodeMatches(code, 'deadbeef', 1_000, 0)).toBe(false);
  });

  test('hitl yes/no maps approve/deny and echo skips own connector origin', () => {
    expect(mapApprovalText(' YES ')).toBe('approve');
    expect(mapApprovalText('No')).toBe('deny');
    expect(mapApprovalText('yes please')).toBe(null);
    expect(connectorOrigin('c1')).toBe('connector:c1');
    expect(shouldEchoUser('connector:c1', 'c1')).toBe(false);
    expect(shouldEchoUser('web', 'c1')).toBe(true);
    expect(appEchoText('hi')).toBe('You · Harnesys\n\nhi');
  });

  test('draft tick coalesces, heartbeats, and splits at 4000', () => {
    const base = {
      pending: 'hello',
      lastSent: '',
      lastSentAt: 0,
      now: 0,
      inFlight: false,
      coalesceMs: COALESCE_MS,
    };
    expect(nextDraftTick({ ...base, now: 100, coalesceMs: 300 })).toEqual({
      send: false,
      text: 'hello',
      split: false,
    });
    expect(nextDraftTick({ ...base, now: 300 })).toEqual({
      send: true,
      text: 'hello',
      split: false,
    });
    expect(
      nextDraftTick({
        ...base,
        pending: 'same',
        lastSent: 'same',
        lastSentAt: 0,
        now: DRAFT_HEARTBEAT_MS - 1,
      }),
    ).toEqual({ send: false, text: 'same', split: false });
    expect(
      nextDraftTick({
        ...base,
        pending: 'same',
        lastSent: 'same',
        lastSentAt: 0,
        now: DRAFT_HEARTBEAT_MS,
      }),
    ).toEqual({ send: true, text: 'same', split: false });

    const long = 'x'.repeat(DRAFT_SPLIT_AT);
    expect(
      nextDraftTick({
        ...base,
        pending: long,
        lastSent: '',
        lastSentAt: 0,
        now: COALESCE_MS,
      }).split,
    ).toBe(true);
    const { chunk, rest } = takeDraftChunk(`${long}tail`);
    expect(chunk).toHaveLength(DRAFT_SPLIT_AT);
    expect(rest).toBe('tail');
  });

  test('mirror patch forces tool off and telegram parses command plus group message', () => {
    const policy = parseMirrorPatch({
      text: false,
      tool: true,
      spawn: true,
      reasoning: true,
      coalesceMs: 999,
    });
    expect(policy.text).toBe(false);
    expect(policy.tool).toBe(false);
    expect(policy.spawn).toBe(false);
    expect(policy.reasoning).toBe(false);
    expect(policy.coalesceMs).toBe(COALESCE_MS);

    const start = parseTelegramUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        text: '/start ABC123',
        chat: { id: 55, type: 'private' },
        from: { id: 77 },
      },
    });
    expect(start).toEqual({
      kind: 'command',
      command: 'start',
      args: 'ABC123',
      chatType: 'private',
      chatId: '55',
      userId: '77',
      messageId: '10',
    });

    const group = parseTelegramUpdate({
      update_id: 2,
      message: {
        message_id: 11,
        text: 'hello group',
        chat: { id: -100, type: 'group' },
        from: { id: 88 },
      },
    });
    expect(group).toEqual({
      kind: 'message',
      chatType: 'group',
      chatId: '-100',
      userId: '88',
      messageId: '11',
      text: 'hello group',
    });
  });
});
