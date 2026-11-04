import { describe, expect, test } from 'bun:test';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import { MemoryThreadMembers, MemoryThreads, memoryThread } from '../threads/thread.fakes.ts';
import { MemoryConnectors, memoryBinding, memoryConnector } from './connector.fakes.ts';
import { bindingWithThread, connectorView, requireConnector } from './connector-view.ts';

class ViewConnectors extends MemoryConnectors {
  override listAgentIds(): string[] {
    return ['a1', 'a2'];
  }
}

function build() {
  const threads = new MemoryThreads();
  const members = new MemoryThreadMembers();
  const connectors = new ViewConnectors(memoryConnector(), [
    memoryBinding({ id: 'b1', chatType: 'supergroup', threadId: 't1', title: 'Team' }),
  ]);
  threads.seed(
    memoryThread({ id: 't1', kind: 'group', title: 'Team thread', autoReplyAgentId: 'a2' }),
  );
  members.ensure('org-1', 't1', 'a1');
  members.ensure('org-1', 't1', 'a2');
  return { threads, members, connectors };
}

describe('bindingWithThread', () => {
  test('summarizes the connected thread', () => {
    const { threads, members, connectors } = build();

    const binding = bindingWithThread(
      { threads, threadAgents: members },
      memoryConnector(),
      connectors.bindings[0] as NonNullable<(typeof connectors.bindings)[0]>,
    );

    expect(binding.threadTitle).toBe('Team thread');
    expect(binding.threadKind).toBe('group');
    expect(binding.agentIds).toEqual(['a1', 'a2']);
    expect(binding.autoReplyAgentId).toBe('a2');
    expect(binding.topicId).toBeNull();
  });
});

describe('connectorView', () => {
  test('exposes bindings without a top-level agent set or thread id', () => {
    const { threads, members, connectors } = build();
    const connector = connectors.connector ?? memoryConnector();

    const view = connectorView(
      { connectors, agents: {} as never, threads, threadAgents: members },
      connector,
    );

    expect(view.botId).toBe('bot-1');
    expect(view.bindings).toHaveLength(1);
    expect(view).not.toHaveProperty('agents');
    expect(view).not.toHaveProperty('threadId');
  });
});

describe('requireConnector', () => {
  test('rejects a connector of another provider', () => {
    const connectors = new MemoryConnectors(memoryConnector({ provider: 'github' }));

    expect(() => requireConnector(connectors, { orgId: 'org-1', connectorId: 'conn-1' })).toThrow(
      ConnectorNotFoundException,
    );
  });
});
