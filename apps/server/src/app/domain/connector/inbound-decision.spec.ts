import { describe, expect, test } from 'bun:test';
import { helpText } from './bot-commands.ts';
import {
  type DecideInboundInput,
  decideInbound,
  type InboundBinding,
  pendingClaimNotice,
  pendingConnectionNotice,
} from './inbound-decision.ts';
import { createPairCode } from './pair-code.ts';
import type { CanonicalAuthor, CanonicalChat, CanonicalUpdate } from './telegram-update.ts';

const DM: CanonicalChat = {
  chatId: '1',
  chatType: 'private',
  chatTitle: '',
  topicId: null,
};

const GROUP: CanonicalChat = {
  chatId: '-100',
  chatType: 'group',
  chatTitle: 'Team',
  topicId: null,
};

const ALICE: CanonicalAuthor = { userId: '77', displayName: 'Alice', username: 'alice' };

function message(text: string, chat: CanonicalChat = DM, author = ALICE): CanonicalUpdate {
  return {
    kind: 'message',
    messageId: '1',
    text,
    replyToMessageId: null,
    author,
    ...chat,
  };
}

function command(name: string, args: string, chat: CanonicalChat = DM): CanonicalUpdate {
  return {
    kind: 'command',
    command: name,
    args,
    messageId: '1',
    replyToMessageId: null,
    author: ALICE,
    ...chat,
  };
}

function base(over: Partial<DecideInboundInput> & { update: CanonicalUpdate }): DecideInboundInput {
  return {
    pairHash: null,
    pairExpiresAt: null,
    now: 1_000,
    binding: null,
    activeRunStatus: null,
    canReadUnmentioned: false,
    ...over,
  };
}

const PAIRED: InboundBinding = {
  chatType: 'private',
  pairedUserId: '77',
  threadId: 'thread-1',
  threadKind: 'chat',
};

const GROUP_CONNECTED: InboundBinding = {
  chatType: 'group',
  pairedUserId: null,
  threadId: 'thread-2',
  threadKind: 'group',
};

describe('decideInbound', () => {
  test('unpaired chat pairs only with a matching start code', () => {
    const { code, hash } = createPairCode();
    expect(decideInbound(base({ update: message('hi') }))).toEqual({
      type: 'reply',
      text: 'This bot is not linked yet.',
      inbox: 'rejected',
    });
    expect(
      decideInbound(base({ update: message('hi', GROUP), canReadUnmentioned: false })),
    ).toEqual({ type: 'ignore' });
    expect(decideInbound(base({ update: message('hi', GROUP), canReadUnmentioned: true }))).toEqual(
      { type: 'claim' },
    );
    expect(
      decideInbound(
        base({
          pairHash: hash,
          pairExpiresAt: 2_000,
          update: command('start', 'WRONG'),
        }),
      ),
    ).toEqual({ type: 'reply', text: 'This bot is not linked yet.', inbox: 'rejected' });
    expect(
      decideInbound(
        base({
          pairHash: hash,
          pairExpiresAt: 2_000,
          update: command('start', code),
        }),
      ),
    ).toEqual({ type: 'pair', userId: '77', chatId: '1', chatType: 'private', title: 'Alice' });
  });

  test('connected chat routes commands, answers, and queueing', () => {
    const paired = { binding: PAIRED };
    expect(
      decideInbound(base({ ...paired, activeRunStatus: 'running', update: command('stop', '') })),
    ).toEqual({ type: 'command', name: 'stop' });
    expect(
      decideInbound(
        base({ ...paired, activeRunStatus: 'needs_input', update: command('compact', '') }),
      ),
    ).toEqual({ type: 'command', name: 'compact' });
    expect(decideInbound(base({ ...paired, update: command('foo', '') }))).toEqual({
      type: 'reply',
      text: helpText(),
      inbox: 'rejected',
    });
    expect(decideInbound(base({ ...paired, update: command('start', '') }))).toEqual({
      type: 'reply',
      text: helpText(),
      inbox: 'rejected',
    });
    expect(
      decideInbound(base({ ...paired, activeRunStatus: 'needs_input', update: message('yes') })),
    ).toEqual({ type: 'respond', text: 'yes' });
    expect(
      decideInbound(base({ ...paired, activeRunStatus: 'running', update: message('later') })),
    ).toEqual({ type: 'enqueue', text: 'later' });
    expect(
      decideInbound(
        base({
          ...paired,
          update: {
            kind: 'message',
            messageId: '1',
            text: 'go',
            replyToMessageId: null,
            author: ALICE,
            chatId: '1',
            chatType: 'private',
            chatTitle: '',
            topicId: null,
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
            messageId: '1',
            text: '',
            replyToMessageId: null,
            author: ALICE,
            chatId: '1',
            chatType: 'private',
            chatTitle: '',
            topicId: null,
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
          update: message('x', DM, { userId: '99', displayName: 'Bob', username: null }),
        }),
      ),
    ).toEqual({
      type: 'reply',
      text: 'This bot is already linked to another Telegram account.',
      inbox: 'rejected',
    });
  });

  test('link command works without a binding in a private chat', () => {
    expect(decideInbound(base({ update: command('link', ' ABC12345 ') }))).toEqual({
      type: 'identity_link',
      code: 'ABC12345',
    });
    expect(decideInbound(base({ update: command('link', 'ABC12345'), binding: PAIRED }))).toEqual({
      type: 'identity_link',
      code: 'ABC12345',
    });
    expect(decideInbound(base({ update: command('link', 'ABC12345', GROUP) }))).toEqual({
      type: 'reply',
      text: 'Send /link in a direct message to this bot.',
      inbox: 'rejected',
    });
  });

  test('start payload with the link prefix links the account', () => {
    expect(
      decideInbound(base({ update: command('start', 'link_ABC12345'), binding: PAIRED })),
    ).toEqual({ type: 'identity_link', code: 'ABC12345' });
    expect(decideInbound(base({ update: command('start', 'link_ ABC12345 ') }))).toEqual({
      type: 'identity_link',
      code: 'ABC12345',
    });
    expect(decideInbound(base({ update: command('start', 'link_') }))).toEqual({
      type: 'reply',
      text: 'This bot is not linked yet.',
      inbox: 'rejected',
    });
  });

  test('group binding waits for an explicit connect', () => {
    expect(
      decideInbound(
        base({
          update: message('hello', GROUP),
          binding: { ...GROUP_CONNECTED, threadId: null },
          canReadUnmentioned: true,
        }),
      ),
    ).toEqual({ type: 'ignore' });
    expect(
      decideInbound(base({ update: message('hello', GROUP), binding: GROUP_CONNECTED })),
    ).toEqual({ type: 'enqueue', text: 'hello' });
  });
});

describe('pending notices', () => {
  test('describe the unconnected and claimed states', () => {
    expect(pendingConnectionNotice()).toContain('not connected');
    expect(pendingClaimNotice()).toContain('Harnesys');
  });
});
