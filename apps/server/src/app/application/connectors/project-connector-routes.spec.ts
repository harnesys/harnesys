import { describe, expect, test } from 'bun:test';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import { memoryBinding, memoryConnector } from './connector.fakes.ts';
import { type RouteConnectors, resolveThreadRoutes } from './project-connector-routes.ts';

function fakeConnectors(
  connectors: ConnectorRecord[],
  bindings: ConnectorBindingRecord[],
): RouteConnectors {
  return {
    listBindingsByThread: (orgId: string) => bindings.filter((binding) => binding.orgId === orgId),
    findById: (orgId: string, id: string) =>
      connectors.find((connector) => connector.orgId === orgId && connector.id === id),
  };
}

describe('resolveThreadRoutes', () => {
  test('returns every active telegram connector bound to the thread regardless of run origin', () => {
    const connectors = [
      memoryConnector({ id: 'c1' }),
      memoryConnector({ id: 'c2' }),
      memoryConnector({ id: 'c3', status: 'paused' }),
      memoryConnector({ id: 'c4', provider: 'discord' }),
    ];
    const bindings = [
      memoryBinding({ id: 'b1', connectorId: 'c1', threadId: 't1' }),
      memoryBinding({ id: 'b2', connectorId: 'c2', threadId: 't1' }),
      memoryBinding({ id: 'b3', connectorId: 'c3', threadId: 't1' }),
      memoryBinding({ id: 'b4', connectorId: 'c4', threadId: 't1' }),
      memoryBinding({ id: 'b5', connectorId: 'missing', threadId: 't1' }),
      memoryBinding({ id: 'b6', connectorId: 'c1', threadId: 't2' }),
    ];

    const routes = resolveThreadRoutes(fakeConnectors(connectors, bindings), 'org-1', 't1', {
      provider: 'telegram',
      agentName: 'Rex',
    });

    expect(routes.map((route) => route.binding.id)).toEqual(['b1', 'b2']);
    expect(routes.every((route) => route.connector.provider === 'telegram')).toBe(true);
    expect(routes.every((route) => route.agentName === 'Rex')).toBe(true);
  });

  test('does not fall back to a connector that is not bound to the thread', () => {
    const connectors = [memoryConnector({ id: 'c1' })];
    const bindings = [memoryBinding({ id: 'b1', connectorId: 'c2', threadId: 't2' })];

    const routes = resolveThreadRoutes(fakeConnectors(connectors, bindings), 'org-1', 't1', {
      provider: 'telegram',
      agentName: 'Rex',
    });

    expect(routes).toEqual([]);
  });
});
