import { Injectable } from '@harnesys/brix';
import type { ListConnectorsResponse, TelegramConnectorActionResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorView, requireConnector } from './connector-view.ts';

export interface ListConnectorsRequest {
  orgId: string;
  provider?: string;
  agentId?: string;
}

@Injectable()
export class ListConnectorsUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
  ) {}

  execute(request: ListConnectorsRequest): ListConnectorsResponse {
    const deps = {
      connectors: this.connectors,
      agents: this.agents,
      threads: this.threads,
      threadAgents: this.threadAgents,
    };
    const items = this.connectors
      .listByOrg(request.orgId)
      .filter((connector) => !request.provider || connector.provider === request.provider)
      .filter(
        (connector) =>
          !request.agentId ||
          this.connectors.listAgentIds(request.orgId, connector.id).includes(request.agentId),
      )
      .map((connector) => connectorView(deps, connector));
    return { items };
  }
}

export interface GetConnectorRequest {
  orgId: string;
  connectorId: string;
}

@Injectable()
export class GetConnectorUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
  ) {}

  execute(request: GetConnectorRequest): TelegramConnectorActionResponse {
    const connector = requireConnector(this.connectors, request);
    return {
      connector: connectorView(
        {
          connectors: this.connectors,
          agents: this.agents,
          threads: this.threads,
          threadAgents: this.threadAgents,
        },
        connector,
      ),
    };
  }
}
