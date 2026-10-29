import { Injectable } from '@harnesys/brix';
import type { ListThreadsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
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
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(request: ListThreadsRequest): Promise<ListThreadsResponse> {
    const rows = this.threads.listByOrg(request.orgId);
    const agentNames = new Map(
      this.agents.list(request.orgId).map((agent) => [agent.id, agent.name] as const),
    );
    const activeByThread = new Map(
      this.threads.listActiveRuns(request.orgId).map((run) => [run.threadId, run] as const),
    );
    const names = runAttributionNamesOf(this.users, this.nodes, request.orgId);
    const ranThreadIds = this.threads.threadIdsWithRuns(request.orgId);
    return {
      items: rows.map((thread) =>
        toThreadSummary({
          thread,
          agentName: agentNames.get(thread.agentId) ?? '',
          active: activeByThread.get(thread.id) ?? null,
          names,
          bindingLocked: ranThreadIds.has(thread.id),
        }),
      ),
    };
  }
}
