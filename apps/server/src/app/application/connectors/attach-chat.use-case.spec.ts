import { describe, expect, test } from 'bun:test';
import type { ConnectorBindingRecord } from '../../domain/connector/connector.ts';
import type { TelegramChatInfo } from '../../domain/connector/telegram-api.port.ts';
import { MemoryAgents, MemoryThreadMembers, MemoryThreads } from '../threads/thread.fakes.ts';
import { AttachChatUseCase } from './attach-chat.use-case.ts';
import { FakeSecrets, FakeTelegram, MemoryConnectors, memoryConnector } from './connector.fakes.ts';

class ChatTelegram extends FakeTelegram {
  lastChatId: string | null = null;

  constructor(readonly info: TelegramChatInfo) {
    super();
  }

  override async getChat(_token: string, chatId: string): Promise<TelegramChatInfo> {
    this.lastChatId = chatId;
    return this.info;
  }
}

function build(info: TelegramChatInfo, bindings: ConnectorBindingRecord[] = []) {
  const threads = new MemoryThreads();
  const members = new MemoryThreadMembers();
  const agents = new MemoryAgents();
  const connectors = new MemoryConnectors(memoryConnector(), bindings);
  const telegram = new ChatTelegram(info);
  const useCase = new AttachChatUseCase(
    connectors,
    new FakeSecrets(),
    agents,
    threads,
    members,
    telegram,
  );
  return { connectors, telegram, useCase };
}

const GROUP: TelegramChatInfo = {
  id: '-100',
  type: 'supergroup',
  title: 'Team',
  username: 'team',
  description: null,
  memberCount: null,
};

describe('AttachChatUseCase', () => {
  test('creates a binding from Telegram chat metadata', async () => {
    const { connectors, telegram, useCase } = build(GROUP);

    const result = await useCase.execute({
      orgId: 'org-1',
      connectorId: 'conn-1',
      body: { chatId: '@team' },
    });

    expect(telegram.lastChatId).toBe('@team');
    expect(result.binding.chatId).toBe('-100');
    expect(result.binding.chatType).toBe('supergroup');
    expect(result.binding.title).toBe('Team');
    expect(result.binding.topicId).toBeNull();
    expect(connectors.bindings).toHaveLength(1);
  });

  test('does not duplicate an existing chat binding', async () => {
    const { connectors, useCase } = build(GROUP);

    await useCase.execute({ orgId: 'org-1', connectorId: 'conn-1', body: { chatId: '-100' } });
    await useCase.execute({ orgId: 'org-1', connectorId: 'conn-1', body: { chatId: '-100' } });

    expect(connectors.bindings).toHaveLength(1);
  });

  test('creates a separate binding for a topic', async () => {
    const { connectors, useCase } = build(GROUP);

    const result = await useCase.execute({
      orgId: 'org-1',
      connectorId: 'conn-1',
      body: { chatId: '-100', topicId: '9', title: 'General' },
    });

    expect(result.binding.topicId).toBe('9');
    expect(result.binding.title).toBe('General');
    expect(connectors.bindings).toHaveLength(1);
  });
});
