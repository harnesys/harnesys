import { Injectable } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ConnectorRepositoryPort } from '../../domain/connector/connector-repository.port.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  syncConnectorAgents,
  syncConnectorAgentsForThread,
} from '../connectors/sync-connector-agents.ts';
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
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: DeleteAgentRequest): Promise<void> {
    requireAgent(this.agents, request.orgId, request.agentId);
    this.detachFromConnectors(request.orgId, request.agentId);
    const threadIds = this.threadAgents.listThreadIdsByAgent(request.orgId, request.agentId);
    const ownThreadIds: string[] = [];
    const survivingThreadIds: string[] = [];
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
        this.threads.patch(request.orgId, threadId, {
          autoReplyAgentId: remaining[0]?.agentId ?? null,
        });
      }
      this.threadAgents.remove(request.orgId, threadId, request.agentId);
      survivingThreadIds.push(threadId);
    }
    for (const threadId of survivingThreadIds) {
      syncConnectorAgentsForThread(
        { connectors: this.connectors, threadAgents: this.threadAgents },
        request.orgId,
        threadId,
      );
    }
    this.detachThreads(request.orgId, ownThreadIds);
    this.threads.deleteMany(request.orgId, ownThreadIds);
    this.agents.delete(request.orgId, request.agentId);
  }

  private detachFromConnectors(orgId: string, agentId: string): void {
    for (const connector of this.connectors.listByOrg(orgId)) {
      const agentIds = this.connectors.listAgentIds(orgId, connector.id);
      if (!agentIds.includes(agentId)) {
        continue;
      }
      this.connectors.removeAgent(orgId, connector.id, agentId);
    }
  }

  private detachThreads(orgId: string, threadIds: string[]): void {
    const connectorIds = new Set<string>();
    for (const threadId of threadIds) {
      for (const binding of this.connectors.listBindingsByThread(orgId, threadId)) {
        connectorIds.add(binding.connectorId);
        this.connectors.detachBinding(orgId, binding.id, new Date().toISOString());
      }
    }
    for (const connectorId of connectorIds) {
      syncConnectorAgents(
        { connectors: this.connectors, threadAgents: this.threadAgents },
        orgId,
        connectorId,
      );
    }
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
