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
    const ownThreadIds: string[] = [];
    for (const threadId of threadIds) {
      const thread = this.threads.findById(request.orgId, threadId);
      if (!thread) {
        continue;
      }
      await this.cancelLiveRuns(request.orgId, threadId, request.agentId, thread.kind === 'group');
      if (thread.kind !== 'group') {
        ownThreadIds.push(threadId);
        continue;
      }
      const remaining = this.threadAgents
        .listByThread(request.orgId, threadId)
        .filter((row) => row.agentId !== request.agentId);
      if (remaining.length === 0) {
        ownThreadIds.push(threadId);
        continue;
      }
      if (thread.autoReplyAgentId === request.agentId) {
        const nextAutoReply = remaining[0];
        if (nextAutoReply) {
          this.threads.patch(request.orgId, threadId, {
            autoReplyAgentId: nextAutoReply.agentId,
          });
        }
      }
      this.threadAgents.remove(request.orgId, threadId, request.agentId);
    }
    this.threads.deleteMany(request.orgId, ownThreadIds);
    this.agents.delete(request.orgId, request.agentId);
  }

  private async cancelLiveRuns(
    orgId: string,
    threadId: string,
    agentId: string,
    onlyOwnRun: boolean,
  ): Promise<void> {
    const lifecycle = await this.executor.lifecycle(orgId);
    const active = await lifecycle.activeByThread(threadId);
    if (!active) {
      return;
    }
    if (onlyOwnRun && active.agentId !== agentId) {
      return;
    }
    try {
      await this.executor.cancel(orgId, active.runId);
    } catch {
      // best-effort: deletion must proceed even if the run is already gone
    }
  }
}
