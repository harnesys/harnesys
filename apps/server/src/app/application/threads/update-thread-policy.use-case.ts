import { Injectable } from '@harnesys/brix';
import type { ThreadSummary, UpdateThreadPolicyBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import type { ThreadPolicy } from '../../domain/thread/thread-policy.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface UpdateThreadPolicyRequest {
  orgId: string;
  threadId: string;
  body: UpdateThreadPolicyBody;
}

@Injectable()
export class UpdateThreadPolicyUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
  ) {}

  execute(request: UpdateThreadPolicyRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const { autoReplyAgentId, contextWindow, mentionGating } = request.body;
    if (autoReplyAgentId) {
      const member = this.threadAgents
        .listByThread(request.orgId, thread.id)
        .some((row) => row.agentId === autoReplyAgentId);
      if (!member) {
        throw new ThreadValidationException('auto-reply agent must be a thread member');
      }
    }
    const policy: ThreadPolicy = { ...thread.policy };
    if (contextWindow !== undefined) {
      if (contextWindow === null) {
        delete policy.contextWindow;
      } else {
        policy.contextWindow = contextWindow;
      }
    }
    if (mentionGating !== undefined) {
      policy.mentionGating = mentionGating;
    }
    const updated = this.threads.patch(request.orgId, thread.id, {
      ...(autoReplyAgentId !== undefined ? { autoReplyAgentId } : {}),
      policy,
    });
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadSummary({
      thread: updated,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
