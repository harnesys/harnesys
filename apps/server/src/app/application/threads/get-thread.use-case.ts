import { Injectable } from '@harnesys/brix';
import type { ThreadPublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { collectInheritedEvents } from '../../domain/thread/fork-logs.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import {
  membersOf,
  participantsOf,
  toThreadPublic,
  waitingForProfileIdFromEvents,
} from './thread.helpers.ts';

export interface GetThreadRequest {
  orgId: string;
  threadId: string;
  userId?: string;
}

@Injectable()
export class GetThreadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly executor: LocalExecutorPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(request: GetThreadRequest): Promise<ThreadPublic> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const lifecycle = await this.executor.lifecycle(request.orgId);
    const events = await this.executor.events(request.orgId);
    const [active, ownEvents] = await Promise.all([
      lifecycle.activeByThread(thread.id),
      events.listByThread(thread.id),
    ]);
    const inherited = await collectInheritedEvents(
      (threadId) => events.listByThread(threadId),
      (threadId) => this.threads.findById(request.orgId, threadId),
      thread,
    );
    const sessionEvents = [...inherited, ...ownEvents];
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadPublic({
      thread,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active,
      events: sessionEvents,
      inheritedEventCount: thread.inheritedEventCount,
      waitingForProfileId: waitingForProfileIdFromEvents(sessionEvents),
      names: runAttributionNamesOf(this.users, this.nodes, request.orgId),
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
      userId: request.userId ?? null,
    });
  }
}
