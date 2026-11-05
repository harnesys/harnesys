import { Injectable } from '@harnesys/brix';
import type { ConnectChatResponse, RenameChatBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { bindingView, connectorView, requireConnector } from './connector-view.ts';

export interface RenameChatRequest {
  orgId: string;
  connectorId: string;
  bindingId: string;
  body: RenameChatBody;
}

@Injectable()
export class RenameChatUseCase {
  constructor(
    private readonly connectors: ConnectorRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
  ) {}

  execute(request: RenameChatRequest): ConnectChatResponse {
    const connector = requireConnector(this.connectors, request);
    this.connectors.updateBindingTitle(
      request.orgId,
      request.bindingId,
      request.body.title,
      new Date().toISOString(),
    );
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
      binding: bindingView(
        { connectors: this.connectors, threads: this.threads, threadAgents: this.threadAgents },
        connector,
        request.bindingId,
      ),
    };
  }
}
