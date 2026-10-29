import { Injectable } from '@harnesys/brix';
import { IssueNotFoundException } from '../../domain/issue/issue.error.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';

export interface RemoveIssueDependencyRequest {
  orgId: string;
  issueId: string;
  dependsOnIssueId: string;
}

@Injectable()
export class RemoveIssueDependencyUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly dependencies: IssueDependencyRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: RemoveIssueDependencyRequest): void {
    const issue = this.issues.findById(request.orgId, request.issueId);
    if (!issue) {
      throw new IssueNotFoundException(request.issueId);
    }
    this.dependencies.delete(request.orgId, request.issueId, request.dependsOnIssueId);
    this.events.emit(request.orgId, { type: 'issue', issue });
  }
}
