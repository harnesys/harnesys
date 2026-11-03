import { Injectable } from '@harnesys/brix';
import type { ThreadSummary } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface RemoveThreadAgentRequest {
  orgId: string;
  threadId: string;
  agentId: string;
}

@Injectable()
export class RemoveThreadAgentUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: RemoveThreadAgentRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    this.threadAgents.remove(request.orgId, thread.id, request.agentId);
    const remaining = this.threadAgents.listByThread(request.orgId, thread.id);
    if (thread.autoReplyAgentId === request.agentId) {
      this.threads.patch(request.orgId, thread.id, {
        autoReplyAgentId: remaining[0]?.agentId ?? null,
      });
    }
    if (thread.kind === 'chat' && remaining.length !== 1) {
      throw new ThreadValidationException('a chat thread has exactly one agent');
    }
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadSummary({
      thread: this.threads.findById(request.orgId, thread.id) ?? thread,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
