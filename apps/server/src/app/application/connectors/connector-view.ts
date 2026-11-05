import type { ConnectorPublic, ThreadMember } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorNotFoundException } from '../../domain/connector/connector.error.ts';
import type { ConnectorBindingRecord, ConnectorRecord } from '../../domain/connector/connector.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { toBindingPublic, toConnectorPublic } from './connector.helpers.ts';

export interface ConnectorViewDeps {
  connectors: ConnectorRepositoryPort;
  agents: AgentRegistryPort;
  threads: ThreadRepositoryPort;
  threadAgents: ThreadAgentRepositoryPort;
}

export function connectorAgentsOf(
  deps: Pick<ConnectorViewDeps, 'connectors' | 'agents'>,
  orgId: string,
  connectorId: string,
): ThreadMember[] {
  return deps.connectors.listAgentIds(orgId, connectorId).map((agentId) => ({
    id: agentId,
    name: deps.agents.findById(orgId, agentId)?.name ?? agentId,
  }));
}

export function bindingView(
  deps: Pick<ConnectorViewDeps, 'connectors' | 'threads' | 'threadAgents'>,
  connector: ConnectorRecord,
  bindingId: string,
) {
  const binding = deps.connectors.findBinding(connector.orgId, connector.id, bindingId);
  return bindingWithThread(deps, connector, binding);
}

export function bindingWithThread(
  deps: Pick<ConnectorViewDeps, 'threads' | 'threadAgents'>,
  connector: ConnectorRecord,
  binding: ConnectorBindingRecord,
) {
  const thread = binding.threadId
    ? (deps.threads.findById(connector.orgId, binding.threadId) ?? null)
    : null;
  const agentIds = thread
    ? deps.threadAgents.listByThread(connector.orgId, thread.id).map((row) => row.agentId)
    : [];
  return toBindingPublic(binding, thread, agentIds);
}

export function connectorView(
  deps: ConnectorViewDeps,
  connector: ConnectorRecord,
): ConnectorPublic {
  const bindings = deps.connectors
    .listBindings(connector.orgId, connector.id)
    .map((binding) => bindingWithThread(deps, connector, binding));
  const view = toConnectorPublic(connector, { bindings });
  const groupBound = bindings.some((binding) => binding.chatType !== 'private');
  if (view.status === 'awaiting_pair' && groupBound) {
    return { ...view, status: 'active' };
  }
  return view;
}

export function requireConnector(
  connectors: ConnectorRepositoryPort,
  request: { orgId: string; connectorId: string },
): ConnectorRecord {
  const found = connectors.findById(request.orgId, request.connectorId);
  if (found?.provider !== 'telegram') {
    throw new ConnectorNotFoundException(request.connectorId);
  }
  return found;
}
