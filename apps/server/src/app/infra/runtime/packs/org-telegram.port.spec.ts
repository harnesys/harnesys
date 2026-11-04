import { describe, expect, test } from 'bun:test';
import type { CapabilityScope } from 'harnesys';
import type { ConnectorInboxRecord, ConnectorRecord } from '../../../domain/connector/connector.ts';
import {
  FakeSecrets,
  FakeTelegram,
  MemoryConnectors,
  memoryBinding,
  memoryConnector,
} from '../../../application/connectors/connector.fakes.ts';
import { OrgTelegramPort } from './org-telegram.port.ts';

const scope: CapabilityScope = { orgId: 'org-1', agentId: 'a1', sourceIds: [], threadId: 't1' };

class RecordingTelegram extends FakeTelegram {
  readonly sent: Array<{ chatId: string; text: string; topicId?: string | null }> = [];

  override async sendMessage(
    _token: string,
    chatId: string,
    text: string,
    options?: { topicId?: string | null },
  ) {
    this.sent.push({ chatId, text, topicId: options?.topicId ?? null });
    return { messageId: '77' };
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
});
