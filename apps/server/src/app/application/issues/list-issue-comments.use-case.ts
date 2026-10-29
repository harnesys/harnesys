import { Injectable } from '@harnesys/brix';
import type { ListIssueCommentsResponse } from '@harnesys/contracts';
import { IssueNotFoundException } from '../../domain/issue/issue.error.ts';
import { IssueCommentRepositoryPort } from '../../domain/issue/issue-comment-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { toCommentPublic } from './issue-mappers.ts';

@Injectable()
export class ListIssueCommentsUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly comments: IssueCommentRepositoryPort,
  ) {}

  execute(orgId: string, issueId: string): ListIssueCommentsResponse {
    if (!this.issues.findById(orgId, issueId)) {
      throw new IssueNotFoundException(issueId);
    }
    return { items: this.comments.listByIssue(orgId, issueId).map(toCommentPublic) };
  }
}
