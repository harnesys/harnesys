import { describe, expect, test } from 'bun:test';
import { ConnectorUpdateError, parseTelegramUpdate } from './telegram-update.ts';

const privateMessage = {
  update_id: 1,
  message: {
    message_id: 10,
    date: 1_700_000_000,
    chat: { id: 42, type: 'private', first_name: 'Ann' },
    from: { id: 42, first_name: 'Ann', username: 'ann' },
    text: 'hello',
  },
};

describe('parseTelegramUpdate', () => {
  test('parses my_chat_member as a chat_member update', () => {
    const update = parseTelegramUpdate({
      update_id: 2,
      my_chat_member: {
        chat: { id: -100_123, type: 'supergroup', title: 'Team' },
        from: { id: 42 },
        new_chat_member: {
          status: 'member',
          user: { id: 7, first_name: 'Coder', is_bot: true },
        },
      },
    });

    expect(update).toEqual({
      kind: 'chat_member',
      chatId: '-100123',
      chatType: 'supergroup',
      chatTitle: 'Team',
      status: 'member',
      userId: '7',
    });
  });

  test('parses forum_topic_created as a topic_created update', () => {
    const update = parseTelegramUpdate({
      update_id: 3,
      message: {
        message_id: 11,
        message_thread_id: 9,
        chat: { id: -100_123, type: 'supergroup', title: 'Team' },
        from: { id: 42, first_name: 'Ann' },
        forum_topic_created: { name: 'General' },
      },
    });

    expect(update).toEqual({
      kind: 'topic_created',
      chatId: '-100123',
      chatType: 'supergroup',
      chatTitle: 'Team',
      topicId: '9',
      title: 'General',
      author: { userId: '42', displayName: 'Ann', username: null },
    });
  });

  test('keeps the topic id of messages inside a forum topic', () => {
    const update = parseTelegramUpdate({
      ...privateMessage,
      message: {
        ...privateMessage.message,
        chat: { id: -100_123, type: 'supergroup', title: 'Team' },
        message_thread_id: 9,
      },
    });

    expect(update.kind).toBe('message');
    if (update.kind === 'message') {
      expect(update.chatId).toBe('-100123');
      expect(update.topicId).toBe('9');
      expect(update.text).toBe('hello');
    }
  });

  test('ignores messages authored by bots', () => {
    const update = parseTelegramUpdate({
      ...privateMessage,
      message: {
        ...privateMessage.message,
        from: { id: 9, first_name: 'Other', is_bot: true },
      },
    });

    expect(update).toEqual({ kind: 'ignored', chatId: '42', chatType: 'private' });
  });

  test('strips the bot suffix from commands', () => {
    const update = parseTelegramUpdate({
      ...privateMessage,
      message: { ...privateMessage.message, text: '/start@coder_bot now' },
    });

    expect(update.kind).toBe('command');
    if (update.kind === 'command') {
      expect(update.command).toBe('start');
      expect(update.args).toBe('now');
    }
  });

  test('rejects channel posts', () => {
    expect(() =>
      parseTelegramUpdate({
        update_id: 4,
        channel_post: {
          message_id: 1,
          chat: { id: -100, type: 'channel', title: 'News' },
          text: 'hello',
        },
      }),
    ).toThrow(ConnectorUpdateError);
  });
});
