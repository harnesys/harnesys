import type { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import type { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';

type SyncConnectorRepository = Pick<
  ConnectorRepositoryPort,
  'listBindings' | 'listBindingsByThread' | 'replaceAgents'
>;

type SyncThreadAgents = Pick<ThreadAgentRepositoryPort, 'listByThread'>;

export interface SyncConnectorAgentsDeps {
  connectors: SyncConnectorRepository;
  threadAgents: SyncThreadAgents;
}

export function syncConnectorAgents(
  deps: SyncConnectorAgentsDeps,
  orgId: string,
  connectorId: string,
): void {
  const agentIds = new Set<string>();
  for (const binding of deps.connectors.listBindings(orgId, connectorId)) {
    if (!binding.threadId) {
      continue;
    }
    for (const row of deps.threadAgents.listByThread(orgId, binding.threadId)) {
      agentIds.add(row.agentId);
    }
  }
  deps.connectors.replaceAgents(orgId, connectorId, [...agentIds]);
}

export function syncConnectorAgentsForThread(
  deps: SyncConnectorAgentsDeps,
  orgId: string,
  threadId: string,
): void {
  const connectorIds = new Set(
    deps.connectors.listBindingsByThread(orgId, threadId).map((binding) => binding.connectorId),
  );
  for (const connectorId of connectorIds) {
    syncConnectorAgents(deps, orgId, connectorId);
  }
}
