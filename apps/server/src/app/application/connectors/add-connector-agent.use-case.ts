import { Injectable } from '@harnesys/brix';
import type { AddConnectorAgentBody, TelegramConnectorActionResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorValidationException } from '../../domain/connector/connector.error.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { connectorView, requireTelegramConnector } from './connector-view.ts';

export interface AddConnectorAgentRequest {
  orgId: string;
  agentId: string;
  body: AddConnectorAgentBody;
}

@Injectable()
export class AddConnectorAgentUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: AddConnectorAgentRequest): TelegramConnectorActionResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const target = this.agents.findById(request.orgId, request.body.agentId);
    if (!target) {
      throw new ConnectorValidationException('Agent not found');
    }
    this.connectors.ensureAgent(request.orgId, connector.id, target.id);
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, connector),
    };
  }
}
