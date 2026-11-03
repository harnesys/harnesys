import { Injectable } from '@harnesys/brix';
import type { ThreadPublic } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { collectInheritedEvents } from '../../domain/thread/fork-logs.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
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

export interface DeleteThreadEventRequest {
  orgId: string;
  threadId: string;
  threadSeq: number;
  userId?: string;
}

const DELETABLE_ERROR_TYPES = new Set(['error', 'run.failed']);

@Injectable()
export class DeleteThreadEventUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly executor: LocalExecutorPort,
    private readonly users: UserRepository,
    private readonly nodes: NodeRepository,
  ) {}

  async execute(request: DeleteThreadEventRequest): Promise<ThreadPublic> {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const events = await this.executor.events(request.orgId);
    const target = (await events.listByThread(request.threadId)).find(
      (event) => event.threadSeq === request.threadSeq,
    );
    if (!target) {
      throw new ThreadNotFoundException(`${request.threadId}:${request.threadSeq}`);
    }
    if (target.type === 'user') {
      await this.executor.truncateThreadFrom(request.orgId, request.threadId, request.threadSeq);
    } else if (DELETABLE_ERROR_TYPES.has(target.type)) {
      await this.executor.removeThreadEvent(request.orgId, request.threadId, request.threadSeq);
    } else {
      throw new ThreadValidationException(`only user and error events can be deleted`);
    }
    this.threads.touch(request.orgId, request.threadId);
    const lifecycle = await this.executor.lifecycle(request.orgId);
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
      inheritedEventCount: inherited.length,
      waitingForProfileId: waitingForProfileIdFromEvents(sessionEvents),
      names: runAttributionNamesOf(this.users, this.nodes, request.orgId),
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
      userId: request.userId ?? null,
    });
  }
}
