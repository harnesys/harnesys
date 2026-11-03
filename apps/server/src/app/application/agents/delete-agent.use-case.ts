import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
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
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: DeleteAgentRequest): Promise<void> {
    requireAgent(this.agents, request.orgId, request.agentId);
    const owned = this.connectors
      .listByOrg(request.orgId)
      .filter((c) => c.agentId === request.agentId);
    for (const connector of owned) {
      await this.secrets.delete(request.orgId, connector.secretRef);
    }
    const threadIds = this.threadAgents.listThreadIdsByAgent(request.orgId, request.agentId);
    await this.cancelLiveRuns(request.orgId, threadIds);
    for (const threadId of threadIds) {
      this.threads.delete(request.orgId, threadId);
      this.threadAgents.remove(request.orgId, threadId, request.agentId);
    }
    this.agents.delete(request.orgId, request.agentId);
  }

  private async cancelLiveRuns(orgId: string, threadIds: string[]): Promise<void> {
    if (threadIds.length === 0) {
      return;
    }
    const lifecycle = await this.executor.lifecycle(orgId);
    for (const threadId of threadIds) {
      const active = await lifecycle.activeByThread(threadId);
      if (!active) {
        continue;
      }
      try {
        await this.executor.cancel(orgId, active.runId);
      } catch {
        // best-effort: deletion must proceed even if the run is already gone
      }
    }
  }
}
