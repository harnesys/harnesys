import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { requireAgent } from './agent.helpers.ts';

export interface DeleteAgentRequest {
  orgId: string;
  agentId: string;
}

@Injectable()
export class DeleteAgentUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly connectors: ConnectorRepositoryPort,
    private readonly secrets: SecretStorePort,
  ) {}

  async execute(request: DeleteAgentRequest): Promise<void> {
    requireAgent(this.agents, request.orgId, request.agentId);
    const owned = this.connectors
      .listByOrg(request.orgId)
      .filter((c) => c.agentId === request.agentId);
    for (const connector of owned) {
      await this.secrets.delete(request.orgId, connector.secretRef);
    }
    this.agents.delete(request.orgId, request.agentId);
  }
}
