import type { ConnectorPublic, ThreadMember } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import type { ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { primaryThreadIdOf, toConnectorPublic } from './connector.helpers.ts';

export interface ConnectorViewDeps {
  connectors: ConnectorRepositoryPort;
  agents: AgentRegistryPort;
}

export function connectorAgentsOf(
  deps: ConnectorViewDeps,
  orgId: string,
  connectorId: string,
): ThreadMember[] {
  return deps.connectors.listAgentIds(orgId, connectorId).map((agentId) => ({
    id: agentId,
    name: deps.agents.findById(orgId, agentId)?.name ?? agentId,
  }));
}

export function connectorView(
  deps: ConnectorViewDeps,
  connector: ConnectorRecord,
): ConnectorPublic {
  const bindings = deps.connectors.listBindings(connector.orgId, connector.id);
  return toConnectorPublic(connector, {
    agents: connectorAgentsOf(deps, connector.orgId, connector.id),
    bindings,
    threadId: primaryThreadIdOf(bindings),
  });
}

export function requireTelegramConnector(
  connectors: ConnectorRepositoryPort,
  request: { orgId: string; agentId: string },
): ConnectorRecord {
  const found = connectors.findByAgentProvider(request.orgId, request.agentId, 'telegram');
  if (!found) {
    throw new ConnectorNotFoundException(`telegram:${request.agentId}`);
  }
  return found;
}
