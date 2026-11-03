import { Injectable } from '@harnesys/brix';
import type { ListThreadsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import { membersByThread, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface ListThreadsRequest {
  orgId: string;
  userId?: string;
}

@Injectable()
export class ListThreadsUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(request: ListThreadsRequest): Promise<ListThreadsResponse> {
    const rows = this.threads.listByOrg(request.orgId);
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    const memberMap = membersByThread(
      deps,
      request.orgId,
      rows.map((thread) => thread.id),
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
          members: memberMap.get(thread.id) ?? [],
          participants: participantsOf(deps, request.orgId, thread.id),
          active: activeByThread.get(thread.id) ?? null,
          names,
          bindingLocked: ranThreadIds.has(thread.id),
          userId: request.userId ?? null,
        }),
      ),
    };
  }
}
