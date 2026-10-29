import { describe, expect, test } from 'bun:test';
import { helpText } from './bot-commands.ts';
import { type DecideInboundInput, decideInbound } from './inbound-decision.ts';
import { createPairCode } from './pair-code.ts';
import type { CanonicalUpdate } from './telegram-update.ts';

function base(over: Partial<DecideInboundInput> & { update: CanonicalUpdate }): DecideInboundInput {
  return {
    connectorStatus: 'awaiting_pair',
    pairHash: null,
    pairExpiresAt: null,
    now: 1_000,
    bindingUserId: null,
    activeRunStatus: null,
    ...over,
  };
}

describe('decideInbound', () => {
  test('unpaired and non-private replies; matching start pairs', () => {
    const { code, hash } = createPairCode();
    expect(
      decideInbound(
        base({
          update: {
            kind: 'message',
            chatType: 'private',
            chatId: '1',
            userId: '9',
            messageId: '1',
            text: 'hi',
          },
        }),
      ),
    ).toEqual({ type: 'reply', text: 'This bot is not linked yet.', inbox: 'rejected' });
    expect(
      decideInbound(
        base({
          update: {
            kind: 'message',
            chatType: 'group',
            chatId: '1',
            userId: '9',
            messageId: '1',
            text: 'hi',
          },
        }),
      ),
    ).toEqual({
      type: 'reply',
      text: 'This bot only accepts a private chat.',
      inbox: 'rejected',
    });
    expect(
      decideInbound(
        base({
          pairHash: hash,
          pairExpiresAt: 2_000,
          update: {
            kind: 'command',
            command: 'start',
            args: 'WRONG',
            chatType: 'private',
            chatId: '1',
            userId: '9',
            messageId: '1',
          },
        }),
      ),
    ).toEqual({ type: 'reply', text: 'This bot is not linked yet.', inbox: 'rejected' });
    expect(
      decideInbound(
        base({
          pairHash: hash,
          pairExpiresAt: 2_000,
          update: {
            kind: 'command',
            command: 'start',
            args: code,
            chatType: 'private',
            chatId: '55',
            userId: '77',
            messageId: '1',
          },
        }),
      ),
    ).toEqual({ type: 'pair', userId: '77', chatId: '55' });
    expect(
      decideInbound(
        base({
          update: {
            kind: 'command',
            command: 'stop',
            args: '',
            chatType: 'private',
            chatId: '1',
            userId: '9',
            messageId: '1',
          },
        }),
      ),
    ).toEqual({ type: 'reply', text: 'This bot is not linked yet.', inbox: 'rejected' });
  });

  test('paired commands, enqueue vs respond, edit ignore, private mismatch', () => {
    const paired = {
      connectorStatus: 'active' as const,
      bindingUserId: '77',
      pairHash: null,
      pairExpiresAt: null,
    };
    expect(
      decideInbound(
        base({
          ...paired,
          activeRunStatus: 'running',
          update: {
            kind: 'command',
            command: 'stop',
            args: '',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '1',
          },
        }),
      ),
    ).toEqual({ type: 'command', name: 'stop' });
    expect(
      decideInbound(
        base({
          ...paired,
          activeRunStatus: 'needs_input',
          update: {
            kind: 'command',
            command: 'compact',
            args: '',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '1',
          },
        }),
      ),
    ).toEqual({ type: 'command', name: 'compact' });
    expect(
      decideInbound(
        base({
          ...paired,
          update: {
            kind: 'command',
            command: 'foo',
            args: '',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '1',
          },
        }),
      ),
    ).toEqual({ type: 'reply', text: helpText(), inbox: 'rejected' });
    expect(
      decideInbound(
        base({
          ...paired,
          activeRunStatus: 'needs_input',
          update: {
            kind: 'message',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '2',
            text: 'yes',
          },
        }),
      ),
    ).toEqual({ type: 'respond', text: 'yes' });
    expect(
      decideInbound(
        base({
          ...paired,
          activeRunStatus: 'running',
          update: {
            kind: 'message',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '3',
            text: 'later',
          },
        }),
      ),
    ).toEqual({ type: 'enqueue', text: 'later' });
    expect(
      decideInbound(
        base({
          ...paired,
          activeRunStatus: null,
          update: {
            kind: 'message',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '4',
            text: 'go',
            fileId: 'f1',
            fileKind: 'document',
          },
        }),
      ),
    ).toEqual({ type: 'enqueue', text: 'go', fileId: 'f1', fileKind: 'document' });
    expect(
      decideInbound(
        base({
          ...paired,
          activeRunStatus: 'needs_input',
          update: {
            kind: 'message',
            chatType: 'private',
            chatId: '1',
            userId: '77',
            messageId: '5',
            text: '',
            fileId: 'f2',
            fileKind: 'photo',
          },
        }),
      ),
    ).toEqual({
      type: 'reply',
      text: 'Reply with text or a button, then send the file.',
      inbox: 'rejected',
    });
    expect(
      decideInbound(
        base({
          ...paired,
          update: { kind: 'edit', chatId: '1', messageId: '9' },
        }),
      ),
    ).toEqual({ type: 'ignore' });
    expect(
      decideInbound(
        base({
          ...paired,
          update: { kind: 'generation_stopped', chatId: '1' },
        }),
      ),
    ).toEqual({ type: 'stop' });
    expect(
      decideInbound(
        base({
          ...paired,
          update: {
            kind: 'message',
            chatType: 'private',
            chatId: '1',
            userId: '99',
            messageId: '6',
            text: 'x',
          },
        }),
      ),
    ).toEqual({
      type: 'reply',
      text: 'This bot is already linked to another Telegram account.',
      inbox: 'rejected',
    });
  });
});
