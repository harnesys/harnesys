import { Injectable } from '@harnesys/brix';
import type { AddThreadParticipantBody, ThreadSummary } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { ThreadNotFoundException } from '../../domain/thread/thread.error.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface AddThreadParticipantRequest {
  orgId: string;
  threadId: string;
  body: AddThreadParticipantBody;
}

@Injectable()
export class AddThreadParticipantUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly users: UserRepository,
  ) {}

  execute(request: AddThreadParticipantRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const user = this.users.findById(request.body.userId);
    if (!user) {
      throw new ThreadNotFoundException(request.body.userId);
    }
    const now = new Date().toISOString();
    this.participants.ensure({
      id: crypto.randomUUID(),
      orgId: request.orgId,
      threadId: thread.id,
      provider: 'app',
      providerUserId: user.id,
      displayName: user.name,
      username: user.login,
      role: 'member',
      firstSeenAt: now,
      lastSeenAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const deps = {
      threadAgents: this.threadAgents,
      participants: this.participants,
      agents: this.agents,
    };
    return toThreadSummary({
      thread,
      members: membersOf(deps, request.orgId, thread.id),
      participants: participantsOf(deps, request.orgId, thread.id),
      active: this.threads.findActiveRun(request.orgId, thread.id) ?? null,
      bindingLocked: this.threads.threadIdsWithRuns(request.orgId).has(thread.id),
    });
  }
}
