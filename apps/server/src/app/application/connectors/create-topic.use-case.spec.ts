import { describe, expect, test } from 'bun:test';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import type { ConnectorBindingRecord } from '../../domain/connector/connector.ts';
import type {
  TelegramChatMember,
  TelegramForumTopic,
} from '../../domain/connector/telegram-api.port.ts';
import { MemoryAgents, MemoryThreadMembers, MemoryThreads } from '../threads/thread.fakes.ts';
import {
  FakeSecrets,
  FakeTelegram,
  MemoryConnectors,
  memoryBinding,
  memoryConnector,
} from './connector.fakes.ts';
import { CreateTopicUseCase } from './create-topic.use-case.ts';

class TopicTelegram extends FakeTelegram {
  constructor(private readonly member: TelegramChatMember) {
    super();
  }

  override async createForumTopic(
    _token: string,
    _chatId: string,
    _name: string,
  ): Promise<TelegramForumTopic> {
    return { chatId: '-100', topicId: '77' };
  }

  override async getChatMember(
    _token: string,
    _chatId: string,
    _userId: string,
  ): Promise<TelegramChatMember> {
    return this.member;
  }
}

function build(member: TelegramChatMember, bindings: ConnectorBindingRecord[]) {
  const threads = new MemoryThreads();
  const members = new MemoryThreadMembers();
  const agents = new MemoryAgents();
  const connectors = new MemoryConnectors(memoryConnector(), bindings);
  const useCase = new CreateTopicUseCase(
    connectors,
    new FakeSecrets(),
    agents,
    threads,
    members,
    new TopicTelegram(member),
  );
  return { connectors, useCase };
}

const ADMIN: TelegramChatMember = {
  status: 'administrator',
  canManageChat: true,
  canManageTopics: true,
};

describe('CreateTopicUseCase', () => {
  test('creates a topic binding for a group', async () => {
    const { connectors, useCase } = build(ADMIN, [
      memoryBinding({ id: 'b1', chatType: 'supergroup', externalChatId: '-100' }),
    ]);

    const result = await useCase.execute({
      orgId: 'org-1',
      connectorId: 'conn-1',
      bindingId: 'b1',
      body: { name: 'General' },
    });

    expect(result.binding.topicId).toBe('77');
    expect(result.binding.title).toBe('General');
    expect(connectors.bindings).toHaveLength(2);
  });

  test('requires manage-topics rights', async () => {
    const { useCase } = build({ status: 'member', canManageChat: false, canManageTopics: false }, [
      memoryBinding({ id: 'b1', chatType: 'supergroup', externalChatId: '-100' }),
    ]);

    await expect(
      useCase.execute({
        orgId: 'org-1',
        connectorId: 'conn-1',
        bindingId: 'b1',
        body: { name: 'General' },
      }),
    ).rejects.toThrow(ConnectorValidationException);
  });

  test('refuses to create a topic from an existing topic', async () => {
    const { useCase } = build(ADMIN, [
      memoryBinding({
        id: 'b1',
        chatType: 'supergroup',
        externalChatId: '-100',
        externalTopicId: '1',
      }),
    ]);

    await expect(
      useCase.execute({
        orgId: 'org-1',
        connectorId: 'conn-1',
        bindingId: 'b1',
        body: { name: 'General' },
      }),
    ).rejects.toThrow(ConnectorValidationException);
  });
});
