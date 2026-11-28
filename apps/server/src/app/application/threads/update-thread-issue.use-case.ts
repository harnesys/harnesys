import { Injectable } from '@harnesys/brix';
import type { ThreadKind, ThreadSummary, UpdateThreadIssueBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { IssueNotFoundException } from '../../domain/issue/issue.error.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import {
  ThreadNotFoundException,
  ThreadValidationException,
} from '../../domain/thread/thread.error.ts';
import type { ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadParticipantRepositoryPort } from '../../domain/thread/thread-participant-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { membersOf, participantsOf, toThreadSummary } from './thread.helpers.ts';

export interface UpdateThreadIssueRequest {
  orgId: string;
  threadId: string;
  body: UpdateThreadIssueBody;
}

@Injectable()
export class UpdateThreadIssueUseCase {
  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly participants: ThreadParticipantRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly issues: IssueRepositoryPort,
  ) {}

  execute(request: UpdateThreadIssueRequest): ThreadSummary {
    const thread = this.threads.findById(request.orgId, request.threadId);
    if (!thread) {
      throw new ThreadNotFoundException(request.threadId);
    }
    const updated =
      request.body.issueId === null
        ? this.threads.patch(request.orgId, thread.id, {
            issueId: null,
            ...(thread.kind === 'issue' ? { kind: 'chat' } : {}),
          })
        : this.bindIssue(request.orgId, thread.id, request.body.issueId, thread.kind);
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
      bindingLocked: this.threads.threadHasRuns(request.orgId, thread.id),
    });
  }

  private bindIssue(
    orgId: string,
    threadId: string,
    issueId: string,
    kind: ThreadKind,
  ): ThreadRecord {
    if (!this.issues.findById(orgId, issueId)) {
      throw new IssueNotFoundException(issueId);
    }
    if (kind !== 'issue' && kind !== 'chat') {
      throw new ThreadValidationException(`a ${kind} thread cannot be bound to an issue`);
    }
    return this.threads.patch(orgId, threadId, { issueId, kind: 'issue' });
  }
}
