import { describe, expect, test } from 'bun:test';
import {
  MemoryAgents,
  MemoryThreadMembers,
  MemoryThreads,
  memoryThread,
} from '../threads/thread.fakes.ts';
import { MemoryConnectors, memoryBinding, memoryConnector } from './connector.fakes.ts';
import { DisconnectChatUseCase } from './disconnect-chat.use-case.ts';

function build() {
  const threads = new MemoryThreads();
  const members = new MemoryThreadMembers();
  const agents = new MemoryAgents();
  const connectors = new MemoryConnectors(memoryConnector(), [
    memoryBinding({ id: 'b1', chatType: 'private', threadId: 't1' }),
  ]);
  threads.seed(memoryThread({ id: 't1', kind: 'chat' }));
  members.ensure('org-1', 't1', 'a1');
  const useCase = new DisconnectChatUseCase(connectors, agents, threads, members);
  return { threads, members, connectors, useCase };
}

describe('DisconnectChatUseCase', () => {
  test('detaches the binding and keeps the thread', () => {
    const { threads, connectors, useCase } = build();

    const result = useCase.execute({ orgId: 'org-1', connectorId: 'conn-1', bindingId: 'b1' });

    expect(connectors.bindings[0]?.threadId).toBeNull();
    expect(connectors.bindings[0]?.status).toBe('unpaired');
    expect(threads.findById('org-1', 't1')).toBeDefined();
    expect(result.connector.bindings[0]?.threadId).toBeNull();
    expect(connectors.replaced).toEqual([{ connectorId: 'conn-1', agentIds: [] }]);
  });

  test('is a no-op for a chat that is already disconnected', () => {
    const { connectors, useCase } = build();
    connectors.findBinding('org-1', 'conn-1', 'b1').threadId = null;

    useCase.execute({ orgId: 'org-1', connectorId: 'conn-1', bindingId: 'b1' });

    expect(connectors.replaced).toEqual([]);
  });
});
