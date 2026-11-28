import { Injectable } from '@harnesys/brix';
import type { ThreadSummary } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface ThreadSummaryAssemblyInput {
  orgId: string;
  thread: ThreadRecord;
  waitingForProfileId?: string;
  userId?: string;
}

@Injectable()
export class ThreadSummaryAssembler {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(input: ThreadSummaryAssemblyInput): Promise<ThreadSummary> {
    const { orgId, thread, waitingForProfileId, userId } = input;
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    const active = this.threads.findActiveRun(orgId, thread.id) ?? null;
    return toThreadSummary({
      thread,
      members: membersOf(deps, orgId, thread.id),
      participants: participantsOf(deps, orgId, thread.id),
      active,
      waitingForProfileId,
      names: runAttributionNamesOf(this.users, this.nodes, orgId),
      bindingLocked: this.threads.threadHasRuns(orgId, thread.id),
      userId: userId ?? null,
    });
  }
}
