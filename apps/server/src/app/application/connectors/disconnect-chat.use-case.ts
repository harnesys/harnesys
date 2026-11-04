import { Injectable } from '@harnesys/brix';
import type { TelegramConnectorActionResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { connectorView, requireConnector } from './connector-view.ts';
import { syncConnectorAgents } from './sync-connector-agents.ts';

export interface DisconnectChatRequest {
  orgId: string;
  connectorId: string;
  bindingId: string;
}

@Injectable()
export class DisconnectChatUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
  ) {}

  execute(request: DisconnectChatRequest): TelegramConnectorActionResponse {
    const connector = requireConnector(this.connectors, request);
    const binding = this.connectors.findBinding(request.orgId, connector.id, request.bindingId);
    if (binding.threadId !== null) {
      this.connectors.detachBinding(request.orgId, binding.id, new Date().toISOString());
      syncConnectorAgents(
        { connectors: this.connectors, threadAgents: this.threadAgents },
        request.orgId,
        connector.id,
      );
    }
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
