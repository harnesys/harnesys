import { Injectable } from '@harnesys/brix';
import type { TelegramConnectorActionResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { connectorView, requireTelegramConnector } from './connector-view.ts';

export interface DisconnectConnectorBindingRequest {
  orgId: string;
  agentId: string;
  bindingId: string;
}

@Injectable()
export class DisconnectConnectorBindingUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: DisconnectConnectorBindingRequest): TelegramConnectorActionResponse {
    const connector = requireTelegramConnector(this.connectors, request);
    const binding = this.connectors.findBinding(request.orgId, connector.id, request.bindingId);
    if (binding.threadId !== null) {
      this.connectors.detachBinding(request.orgId, binding.id, new Date().toISOString());
    }
    return {
      connector: connectorView({ connectors: this.connectors, agents: this.agents }, connector),
    };
  }
}
