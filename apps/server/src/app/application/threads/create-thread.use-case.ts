import { Injectable } from '@harnesys/brix';
import type { CreateThreadBody, ThreadPublic } from '@harnesys/contracts';
import { AgentNotFoundException } from '../../domain/agent/agent.error.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { collectInheritedEvents } from '../../domain/thread/fork-logs.ts';
import { LocalExecutorPort } from '../../domain/thread/local-executor.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { DEFAULT_THREAD_TITLE, toThreadPublic } from './thread.helpers.ts';

export interface CreateThreadRequest {
  orgId: string;
  body: CreateThreadBody;
}

@Injectable()
export class CreateThreadUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly executor: LocalExecutorPort,
  ) {}

  async execute(request: CreateThreadRequest): Promise<ThreadPublic> {
    const agent = this.agents.findById(request.orgId, request.body.agentId);
    if (!agent) {
      throw new AgentNotFoundException(request.body.agentId);
    }
    let parentThreadId: string | null = null;
    let forkAt: string | null = null;
    let inheritedEventCount = 0;
    if (request.body.parentThreadId) {
      const parent = this.threads.findById(request.orgId, request.body.parentThreadId);
      if (!parent) {
        throw new ThreadNotFoundException(request.body.parentThreadId);
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
    const now = new Date().toISOString();
    const thread = this.threads.insert({
      id: crypto.randomUUID(),
      orgId: request.orgId,
      agentId: agent.id,
      originAgentId: agent.id,
      title: request.body.title?.trim() || DEFAULT_THREAD_TITLE,
      kind: request.body.kind ?? 'chat',
      parentThreadId,
      forkAt,
      inheritedEventCount,
      metadata: { runMode: agent.defaultModeId ?? undefined },
      runProfileId: null,
      runDirectory: null,
      createdAt: now,
      updatedAt: now,
      lastReadAt: now,
    });
    return toThreadPublic({
      thread,
      agentName: agent.name,
      active: null,
      events: [],
      inheritedEventCount,
    });
  }
}
