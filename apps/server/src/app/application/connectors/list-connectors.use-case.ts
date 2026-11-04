import { Injectable } from '@harnesys/brix';
import type { ListConnectorsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { connectorView } from './connector-view.ts';

export interface ListConnectorsRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class ListConnectorsUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: ListConnectorsRequest): ListConnectorsResponse {
    const items = this.connectors
      .listByOrg(request.orgId)
      .filter((connector) =>
        this.connectors.listAgentIds(request.orgId, connector.id).includes(request.agentId),
      )
      .map((connector) =>
        connectorView({ connectors: this.connectors, agents: this.agents }, connector),
      );
    return { items };
  }
}
