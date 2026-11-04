import { Injectable } from '@harnesys/brix';
import type { AddConnectorAgentBody, TelegramConnectorActionResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { connectorView, requireTelegramConnector } from './connector-view.ts';

export interface RemoveConnectorAgentRequest {
  orgId: string;
  agentId: string;
  body: AddConnectorAgentBody;
}

@Injectable()
export class RemoveConnectorAgentUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: RemoveConnectorAgentRequest): TelegramConnectorActionResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const current = this.connectors.listAgentIds(request.orgId, connector.id);
    if (!current.includes(request.body.agentId)) {
      return {
        connector: connectorView({ connectors: this.connectors, agents: this.agents }, connector),
      };
    }
    if (current.length === 1) {
      throw new ConnectorValidationException('A bot needs at least one agent');
    }
    this.connectors.removeAgent(request.orgId, connector.id, request.body.agentId);
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, connector),
    };
  }
}
