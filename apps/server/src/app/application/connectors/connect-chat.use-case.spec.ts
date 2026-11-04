import { describe, expect, test } from 'bun:test';
import {
  ConnectorConflictException,
  ConnectorPromotionRequiredException,
  ConnectorValidationException,
} from '../../domain/connector/connector.error.ts';
import type { ConnectorBindingRecord } from '../../domain/connector/connector.ts';
import {
  MemoryAgents,
  MemoryThreadMembers,
  MemoryThreads,
  memoryAgent,
  memoryThread,
} from '../threads/thread.fakes.ts';
import { ConnectChatUseCase } from './connect-chat.use-case.ts';
import {
  FakeSecrets,
  FakeTelegram,
  MemoryConnectors,
  memoryBinding,
  memoryConnector,
} from './connector.fakes.ts';

function build(bindings: ConnectorBindingRecord[]) {
  const threads = new MemoryThreads();
  const members = new MemoryThreadMembers();
  const agents = new MemoryAgents();
  agents.seed(memoryAgent({ id: 'a1', name: 'Coder' }));
  agents.seed(memoryAgent({ id: 'a2', name: 'Reviewer' }));
  const connectors = new MemoryConnectors(memoryConnector(), bindings);
  const useCase = new ConnectChatUseCase(
    connectors,
    new FakeSecrets(),
    threads,
    members,
    agents,
    new FakeTelegram(),
  );
  return { threads, members, agents, connectors, useCase };
}

describe('ConnectChatUseCase', () => {
  test('creates a chat thread for a direct message with one agent', async () => {
    const { connectors, useCase, threads } = build([
      memoryBinding({ id: 'b1', externalChatId: '42', chatType: 'private' }),
    ]);

    const result = await useCase.execute({
      orgId: 'org-1',
      connectorId: 'conn-1',
      bindingId: 'b1',
      body: { mode: 'new', agentIds: ['a1'] },
    });

    const threadId = result.binding.threadId;
    expect(threadId).not.toBeNull();
    const thread = threads.findById('org-1', threadId as string);
    expect(thread?.kind).toBe('chat');
    expect(thread?.autoReplyAgentId).toBe('a1');
    expect(result.binding.threadKind).toBe('chat');
    expect(connectors.replaced).toEqual([{ connectorId: 'conn-1', agentIds: ['a1'] }]);
  });

  test('rejects a direct message with more than one agent', async () => {
    const { useCase, connectors } = build([
      memoryBinding({ id: 'b1', externalChatId: '42', chatType: 'private' }),
    ]);

    await expect(
      useCase.execute({
        orgId: 'org-1',
        connectorId: 'conn-1',
        bindingId: 'b1',
        body: { mode: 'new', agentIds: ['a1', 'a2'] },
      }),
    ).rejects.toThrow(ConnectorValidationException);
    expect(connectors.bindings[0]?.threadId).toBeNull();
  });

  test('creates a group thread with an auto-reply agent', async () => {
    const { useCase, threads, members } = build([
      memoryBinding({ id: 'b1', externalChatId: '-100', chatType: 'supergroup' }),
    ]);

    const result = await useCase.execute({
      orgId: 'org-1',
      connectorId: 'conn-1',
      bindingId: 'b1',
      body: { mode: 'new', agentIds: ['a1', 'a2'], autoReplyAgentId: 'a2' },
    });

    const thread = threads.findById('org-1', result.binding.threadId as string);
    expect(thread?.kind).toBe('group');
    expect(thread?.autoReplyAgentId).toBe('a2');
    expect(members.listByThread('org-1', thread?.id as string)).toHaveLength(2);
    expect(result.binding.agentIds.sort()).toEqual(['a1', 'a2']);
  });

  test('requires promotion before connecting a group to a chat thread', async () => {
    const { useCase, threads } = build([
      memoryBinding({ id: 'b1', externalChatId: '-100', chatType: 'group' }),
    ]);
    threads.seed(memoryThread({ id: 't1', kind: 'chat' }));

    await expect(
      useCase.execute({
        orgId: 'org-1',
        connectorId: 'conn-1',
        bindingId: 'b1',
        body: { mode: 'existing', threadId: 't1' },
      }),
    ).rejects.toThrow(ConnectorPromotionRequiredException);
    expect(threads.findById('org-1', 't1')?.kind).toBe('chat');
  });

  test('promotes a chat thread when the caller allows it', async () => {
    const { useCase, threads, members } = build([
      memoryBinding({ id: 'b1', externalChatId: '-100', chatType: 'group' }),
    ]);
    threads.seed(memoryThread({ id: 't1', kind: 'chat' }));
    members.ensure('org-1', 't1', 'a1');

    const result = await useCase.execute({
      orgId: 'org-1',
      connectorId: 'conn-1',
      bindingId: 'b1',
      body: { mode: 'existing', threadId: 't1', allowPromote: true },
    });

    expect(threads.findById('org-1', 't1')?.kind).toBe('group');
    expect(result.binding.threadId).toBe('t1');
  });

  test('refuses to connect a thread that another chat already uses', async () => {
    const { useCase, threads, members } = build([
      memoryBinding({ id: 'b1', externalChatId: '42', chatType: 'private' }),
      memoryBinding({ id: 'b2', externalChatId: '43', chatType: 'private', threadId: 't1' }),
    ]);
    threads.seed(memoryThread({ id: 't1', kind: 'chat' }));
    members.ensure('org-1', 't1', 'a1');

    await expect(
      useCase.execute({
        orgId: 'org-1',
        connectorId: 'conn-1',
        bindingId: 'b1',
        body: { mode: 'existing', threadId: 't1' },
      }),
    ).rejects.toThrow(ConnectorConflictException);
  });
});
