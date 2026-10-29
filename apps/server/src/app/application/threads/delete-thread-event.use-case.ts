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
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { runAttributionNamesOf } from './run-attribution.ts';
import { toThreadPublic, waitingForProfileIdFromEvents } from './thread.helpers.ts';

export interface DeleteThreadEventRequest {
  orgId: string;
  threadId: string;
  runId: string;
  seq: number;
}

const DELETABLE_ERROR_TYPES = new Set(['error', 'run.failed']);

@Injectable()
export class DeleteThreadEventUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
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
    const lifecycle = await this.executor.lifecycle(request.orgId);
    const rec = await lifecycle.get(request.runId);
    if (!rec || rec.threadId !== request.threadId) {
      throw new ThreadNotFoundException(request.runId);
    }
    const events = await this.executor.events(request.orgId);
    const target = (await events.listByThread(request.threadId)).find(
      (event) => event.runId === request.runId && event.seq === request.seq,
    );
    if (!target) {
      throw new ThreadNotFoundException(`${request.runId}:${request.seq}`);
    }
    if (target.type === 'user') {
      await this.executor.truncateThreadFrom(
        request.orgId,
        request.threadId,
        request.runId,
        request.seq,
      );
    } else if (DELETABLE_ERROR_TYPES.has(target.type)) {
      await this.executor.removeThreadEvent(
        request.orgId,
        request.threadId,
        request.runId,
        request.seq,
      );
    } else {
      throw new ThreadValidationException(`only user and error events can be deleted`);
    }
    this.threads.touch(request.orgId, request.threadId);
    const agent = this.agents.findById(request.orgId, thread.agentId);
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
      inheritedEventCount: inherited.length,
      waitingForProfileId: waitingForProfileIdFromEvents(sessionEvents),
      names: runAttributionNamesOf(this.users, this.nodes, request.orgId),
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
