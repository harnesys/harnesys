import { Injectable } from '@harnesys/brix';
import type { ThreadPublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { collectInheritedEvents } from '../../domain/thread/fork-logs.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import { toThreadPublic, waitingForProfileIdFromEvents } from './thread.helpers.ts';

export interface GetThreadRequest {
  orgId: string;
  threadId: string;
}

@Injectable()
export class GetThreadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
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
    const agent = this.agents.findById(request.orgId, thread.agentId);
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
    return toThreadPublic({
      thread,
      agentName: agent?.name ?? '',
      active,
      events: sessionEvents,
      inheritedEventCount: thread.inheritedEventCount,
      waitingForProfileId: waitingForProfileIdFromEvents(sessionEvents),
      names: runAttributionNamesOf(this.users, this.nodes, request.orgId),
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
