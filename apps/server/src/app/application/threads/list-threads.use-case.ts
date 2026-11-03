import { Injectable } from '@harnesys/brix';
import type { ListThreadsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import { toThreadSummary } from './thread.helpers.ts';

export interface ListThreadsRequest {
  orgId: string;
}

@Injectable()
export class ListThreadsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(request: ListThreadsRequest): Promise<ListThreadsResponse> {
    const rows = this.threads.listByOrg(request.orgId);
    const agentNames = new Map(
      this.agents.list(request.orgId).map((agent) => [agent.id, agent.name] as const),
    );
    const agentIdByThread = new Map<string, string>();
    for (const member of this.threadAgents.listByThreads(
      request.orgId,
      rows.map((thread) => thread.id),
    )) {
      if (!agentIdByThread.has(member.threadId)) {
        agentIdByThread.set(member.threadId, member.agentId);
      }
    }
    const activeByThread = new Map(
      this.threads.listActiveRuns(request.orgId).map((run) => [run.threadId, run] as const),
    );
    const names = runAttributionNamesOf(this.users, this.nodes, request.orgId);
    const ranThreadIds = this.threads.threadIdsWithRuns(request.orgId);
    return {
      items: rows.map((thread) => {
        const agentId = agentIdByThread.get(thread.id) ?? '';
        return toThreadSummary({
          thread,
          agentId,
          agentName: agentNames.get(agentId) ?? '',
          active: activeByThread.get(thread.id) ?? null,
          names,
          bindingLocked: ranThreadIds.has(thread.id),
        });
      }),
    };
  }
}
