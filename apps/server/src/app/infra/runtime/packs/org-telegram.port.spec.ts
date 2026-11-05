import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from 'harnesys';
import {
  FakeSecrets,
  FakeTelegram,
  MemoryConnectors,
  memoryBinding,
  memoryConnector,
} from '../../../application/connectors/connector.fakes.ts';
import type { ConnectorInboxRecord, ConnectorRecord } from '../../../domain/connector/connector.ts';
import type {
  TelegramMediaKind,
  TelegramMediaOptions,
  TelegramMediaSource,
} from '../../../domain/connector/telegram-api.port.ts';
import { OrgTelegramPort } from './org-telegram.port.ts';

const scope: CapabilityScope = { orgId: 'org-1', agentId: 'a1', sourceIds: [], threadId: 't1' };

class RecordingTelegram extends FakeTelegram {
  readonly sent: Array<{ chatId: string; text: string; topicId?: string | null }> = [];
  readonly media: Array<{
    chatId: string;
    kind: TelegramMediaKind;
    filename?: string;
    caption?: string;
    topicId?: string | null;
  }> = [];
  readonly albums: Array<{ chatId: string; count: number; topicId?: string | null }> = [];

  override async sendMessage(
    _token: string,
    chatId: string,
    text: string,
    options?: {
      topicId?: string | null;
      parseMode?: 'HTML' | 'MarkdownV2';
      disableNotification?: boolean;
      protectContent?: boolean;
      linkPreview?: boolean;
      replyToMessageId?: string | null;
      replyMarkup?: { inlineKeyboard: Array<Array<{ label: string; value: string }>> };
    },
  ) {
    this.sent.push({ chatId, text, topicId: options?.topicId ?? null });
    return { messageId: '77' };
  }

  override async sendMedia(
    _token: string,
    chatId: string,
    kind: TelegramMediaKind,
    source: TelegramMediaSource,
    options?: TelegramMediaOptions,
  ) {
    this.media.push({
      chatId,
      kind,
      ...(source.filename !== undefined ? { filename: source.filename } : {}),
      ...(options?.caption !== undefined ? { caption: options.caption } : {}),
      topicId: options?.topicId ?? null,
    });
    return { messageId: '78' };
  }

  override async sendMediaGroup(
    _token: string,
    chatId: string,
    items: unknown[],
    options?: { topicId?: string | null; disableNotification?: boolean },
  ) {
    this.albums.push({ chatId, count: items.length, topicId: options?.topicId ?? null });
    return items.map((_, index) => ({ messageId: String(90 + index) }));
  }
}

class InboxConnectors extends MemoryConnectors {
  rows: ConnectorInboxRecord[] = [];

  override listRecentInbox(): ConnectorInboxRecord[] {
    return this.rows;
  }
}

function build(connector: ConnectorRecord = memoryConnector()) {
  const connectors = new InboxConnectors(connector, [
    memoryBinding({ id: 'b1', externalChatId: '-100', chatType: 'supergroup' }),
    memoryBinding({
      id: 'b2',
      externalChatId: '-200',
      chatType: 'channel',
      title: 'News',
      threadId: 't2',
    }),
    memoryBinding({
      id: 'b3',
      externalChatId: '-100',
      externalTopicId: '9',
      chatType: 'supergroup',
      title: 'Release notes',
    }),
  ]);
  const telegram = new RecordingTelegram();
  const port = new OrgTelegramPort({ connectors, secrets: new FakeSecrets(), telegram });
  return { connectors, telegram, port };
}

describe('OrgTelegramPort', () => {
  test('lists chats including channels and topics', () => {
    const { port } = build();
    const chats = port.listChats(scope);
    expect(chats.map((chat) => chat.chatType)).toEqual(['supergroup', 'channel', 'supergroup']);
    expect(chats[1]?.title).toBe('News');
    expect(port.listChats(scope, { type: 'channel' })).toHaveLength(1);
  });

  test('posts into a channel resolved by title', async () => {
    const { port, telegram } = build();
    const result = await port.sendMessage(scope, { chat: 'News', text: 'Ship it' });
    expect(result).toEqual({ messageId: '77', chatId: '-200', topicId: null });
    expect(telegram.sent).toEqual([{ chatId: '-200', text: 'Ship it', topicId: null }]);
  });

  test('posts into a forum topic by chat id and topic id', async () => {
    const { port, telegram } = build();
    await port.sendMessage(scope, { chat: '-100', topicId: '9', text: 'Hello' });
    expect(telegram.sent[0]).toEqual({ chatId: '-100', text: 'Hello', topicId: '9' });
  });

  test('refuses chats the bot does not know', async () => {
    const { port } = build();
    await expect(port.sendMessage(scope, { chat: '@stranger', text: 'hi' })).rejects.toThrow(
      'does not know',
    );
  });

  test('reads recent inbox messages for a chat', async () => {
    const { port, connectors } = build();
    connectors.rows = [
      {
        id: 'i1',
        connectorId: 'conn-1',
        bindingId: 'b2',
        updateId: 11,
        kind: 'message',
        payload: {
          kind: 'message',
          chatId: '-200',
          topicId: null,
          messageId: '5',
          text: 'Launch notes',
          author: { displayName: 'Ann', username: 'ann' },
        },
        status: 'consumed',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const messages = await port.readMessages(scope, { chat: 'News', limit: 10 });
    expect(messages).toEqual([
      {
        messageId: '5',
        authorName: 'Ann',
        authorUsername: 'ann',
        text: 'Launch notes',
        topicId: null,
        receivedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  test('posts media with caption and topic', async () => {
    const { port, telegram } = build();
    const result = await port.sendMedia(scope, {
      chat: '-100',
      topicId: '9',
      kind: 'photo',
      source: { bytes: new Uint8Array([1, 2, 3]), filename: 'cover.png' },
      caption: 'Cover',
    });

    expect(result).toEqual({ messageId: '78', chatId: '-100', topicId: '9' });
    expect(telegram.media).toEqual([
      { chatId: '-100', kind: 'photo', filename: 'cover.png', caption: 'Cover', topicId: '9' },
    ]);
  });

  test('rejects an album outside the 2 to 10 item range', async () => {
    const { port } = build();
    await expect(
      port.sendAlbum(scope, {
        chat: '-200',
        items: [{ kind: 'photo', source: { bytes: new Uint8Array([1]) } }],
      }),
    ).rejects.toThrow('2 to 10');
  });

  test('posts an album and returns every message id', async () => {
    const { port, telegram } = build();
    const posts = await port.sendAlbum(scope, {
      chat: '-200',
      items: [
        { kind: 'photo', source: { bytes: new Uint8Array([1]) } },
        { kind: 'document', source: { fileId: 'file-1' } },
      ],
    });

    expect(posts.map((post) => post.messageId)).toEqual(['90', '91']);
    expect(telegram.albums).toEqual([{ chatId: '-200', count: 2, topicId: null }]);
  });
});
