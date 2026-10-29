import { Injectable } from '@harnesys/brix';
import type { AddIssueCommentBody, ListIssueCommentsResponse } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import {
  IssueNotFoundException,
  IssueValidationException,
} from '../../domain/issue/issue.error.ts';
import type { IssueCommentInsert } from '../../domain/issue/issue.ts';
import { IssueCommentRepositoryPort } from '../../domain/issue/issue-comment-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { toCommentPublic } from './issue-mappers.ts';

export interface AddIssueCommentRequest {
  orgId: string;
  issueId: string;
  authorType?: 'human' | 'agent';
  authorAgentId?: string | null;
  body: AddIssueCommentBody;
}

@Injectable()
export class AddIssueCommentUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly comments: IssueCommentRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: AddIssueCommentRequest): ListIssueCommentsResponse {
    const issue = this.issues.findById(request.orgId, request.issueId);
    if (!issue) {
      throw new IssueNotFoundException(request.issueId);
    }
    const authorAgentId = request.authorAgentId ?? null;
    if (authorAgentId && !this.agents.findById(request.orgId, authorAgentId)) {
      throw new IssueValidationException(`unknown comment author: ${authorAgentId}`);
    }
    const record: IssueCommentInsert = {
      id: crypto.randomUUID(),
      orgId: request.orgId,
      issueId: issue.id,
      authorType: request.authorType ?? 'human',
      authorAgentId,
      body: request.body.body,
      createdAt: new Date().toISOString(),
    };
    const comment = this.comments.insert(record);
    this.events.emit(request.orgId, { type: 'issue', issue });
    return { items: [toCommentPublic(comment)] };
  }
}
