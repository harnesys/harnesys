import { describe, expect, test } from 'bun:test';
import type { ConnectorBindingRecord } from '../../domain/connector/connector.ts';
import {
  type SyncConnectorAgentsDeps,
  syncConnectorAgents,
  syncConnectorAgentsForThread,
} from './sync-connector-agents.ts';

function binding(id: string, connectorId: string, threadId: string | null): ConnectorBindingRecord {
  return {
    id,
    connectorId,
    orgId: 'org-1',
    externalChatId: `chat-${id}`,
    externalTopicId: null,
    chatType: 'supergroup',
    title: null,
    threadId,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function build() {
  const bindings = [
    binding('b1', 'c1', 't1'),
    binding('b2', 'c1', null),
    binding('b3', 'c2', 't2'),
  ];
  const members: Record<string, string[]> = { t1: ['a1', 'a2'], t2: ['a2', 'a3'] };
  const replaced: Array<{ connectorId: string; agentIds: string[] }> = [];
  const deps: SyncConnectorAgentsDeps = {
    connectors: {
      listBindings: (_orgId: string, connectorId: string) =>
        bindings.filter((row) => row.connectorId === connectorId),
      listBindingsByThread: (_orgId: string, threadId: string) =>
        bindings.filter((row) => row.threadId === threadId),
      replaceAgents: (_orgId: string, connectorId: string, agentIds: string[]) => {
        replaced.push({ connectorId, agentIds });
      },
    },
    threadAgents: {
      listByThread: (_orgId: string, threadId: string) =>
        (members[threadId] ?? []).map((agentId) => ({
          threadId,
          agentId,
          createdAt: '2026-01-01T00:00:00.000Z',
        })),
    },
  };
  return { deps, replaced };
}

describe('syncConnectorAgents', () => {
  test('derives the ACL from the agents of connected threads', () => {
    const { deps, replaced } = build();

    syncConnectorAgents(deps, 'org-1', 'c1');

    expect(replaced).toEqual([{ connectorId: 'c1', agentIds: ['a1', 'a2'] }]);
  });

  test('syncs every connector bound to a thread', () => {
    const { deps, replaced } = build();

    syncConnectorAgentsForThread(deps, 'org-1', 't2');

    expect(replaced).toEqual([{ connectorId: 'c2', agentIds: ['a2', 'a3'] }]);
  });
});
