import { Injectable } from '@harnesys/brix';
import type { CreateThreadBody, ThreadKind, ThreadPublic } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { EventBusPort } from '../../domain/events/event-bus.port.ts';
import { UserNotFoundException } from '../../domain/identity/identity.error.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { collectInheritedEvents } from '../../domain/thread/fork-logs.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadParticipantInsert } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import {
  DEFAULT_THREAD_TITLE,
  membersOf,
  participantsOf,
  toThreadPublic,
} from './thread.helpers.ts';

export interface CreateThreadRequest {
  orgId: string;
  body: CreateThreadBody;
}

interface ForkInfo {
  parentThreadId: string | null;
  forkAt: string | null;
  inheritedEventCount: number;
}

@Injectable()
export class CreateThreadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
    private readonly executor: LocalExecutorPort,
    private readonly events: EventBusPort,
  ) {}

  async execute(request: CreateThreadRequest): Promise<ThreadPublic> {
    const { agent, agentIds, kind } = this.resolveAgents(request);
    const fork = await this.resolveFork(request, kind);
    const now = new Date().toISOString();
    const threadId = crypto.randomUUID();
    const participantRows = this.resolveParticipants(request, threadId, now);
    const thread = this.threads.insert({
      id: threadId,
      orgId: request.orgId,
      title: request.body.title?.trim() || DEFAULT_THREAD_TITLE,
      kind,
      autoReplyAgentId: agent.id,
      policy: { version: 1 },
      lastThreadSeq: 0,
      conversationCount: 0,
      parentThreadId: fork.parentThreadId,
      forkAt: fork.forkAt,
      inheritedEventCount: fork.inheritedEventCount,
      metadata: { runMode: agent.defaultModeId ?? undefined },
      runProfileId: null,
      runDirectory: null,
      createdAt: now,
      updatedAt: now,
      lastReadAt: now,
    });
    for (const agentId of agentIds) {
      this.threadAgents.ensure(request.orgId, thread.id, agentId);
    }
    for (const row of participantRows) {
      this.participants.ensure(row);
    }
    this.events.publish(request.orgId, 'thread.created', {
      orgId: request.orgId,
      threadId: thread.id,
      title: thread.title,
      kind,
      agentId: agent.id,
      createdAt: now,
    });
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadPublic({
      thread,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active: null,
      events: [],
      inheritedEventCount: fork.inheritedEventCount,
    });
  }

  private resolveAgents(request: CreateThreadRequest): {
    agent: AgentRecord;
    agentIds: string[];
    kind: ThreadKind;
  } {
    const agent = this.agents.findById(request.orgId, request.body.agentId);
    if (!agent) {
      throw new AgentNotFoundException(request.body.agentId);
    }
    const agentIds = [...new Set([agent.id, ...(request.body.agentIds ?? [])])];
    for (const agentId of agentIds) {
      if (!this.agents.findById(request.orgId, agentId)) {
        throw new AgentNotFoundException(agentId);
      }
    }
    const requestedKind = request.body.kind ?? (agentIds.length > 1 ? 'group' : 'chat');
    if (agentIds.length > 1 && requestedKind === 'chat') {
      throw new ThreadValidationException('a chat thread has exactly one agent');
    }
    return { agent, agentIds, kind: agentIds.length > 1 ? 'group' : requestedKind };
  }

  private async resolveFork(request: CreateThreadRequest, kind: ThreadKind): Promise<ForkInfo> {
    let parentThreadId: string | null = null;
    let forkAt: string | null = null;
    let inheritedEventCount = 0;
    if (request.body.parentThreadId) {
      const parent = this.threads.findById(request.orgId, request.body.parentThreadId);
      if (!parent) {
        throw new ThreadNotFoundException(request.body.parentThreadId);
      }
      if (parent.kind === 'group' || kind === 'group') {
        throw new ThreadValidationException('forking a group thread is not supported');
      }
      parentThreadId = parent.id;
      forkAt = request.body.forkAt?.trim() ? request.body.forkAt.trim() : null;
      if (forkAt) {
        const events = await this.executor.events(request.orgId);
        const inherited = await collectInheritedEvents(
          (threadId) => events.listByThread(threadId),
          (threadId) => this.threads.findById(request.orgId, threadId),
          parent,
        );
        inheritedEventCount = inherited.length;
      }
    } else if (request.body.forkAt?.trim()) {
      throw new ThreadValidationException('parent required for fork');
    }
    return { parentThreadId, forkAt, inheritedEventCount };
  }

  private resolveParticipants(
    request: CreateThreadRequest,
    threadId: string,
    now: string,
  ): ThreadParticipantInsert[] {
    return (request.body.participantUserIds ?? []).map((userId) => {
      const user = this.users.findById(userId);
      if (!user) {
        throw new UserNotFoundException(userId);
      }
      return {
        id: crypto.randomUUID(),
        orgId: request.orgId,
        threadId,
        provider: 'app',
        providerUserId: user.id,
        displayName: user.name,
        username: user.login,
        role: 'member',
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      };
    });
  }
}
