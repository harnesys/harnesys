import { Injectable } from '@harnesys/brix';
import type { AddIssueDependencyBody } from '@harnesys/contracts';
import { createsBlocksCycle } from '../../domain/issue/dependency-cycle.ts';
import {
  IssueDependencyCycleException,
  IssueNotFoundException,
  IssueValidationException,
} from '../../domain/issue/issue.error.ts';
import type { IssueDependencyInsert } from '../../domain/issue/issue.ts';
import { IssueDependencyRepositoryPort } from '../../domain/issue/issue-dependency-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';

export interface AddIssueDependencyRequest {
  orgId: string;
  issueId: string;
  body: AddIssueDependencyBody;
}

@Injectable()
export class AddIssueDependencyUseCase {
  constructor(
    private readonly issues: IssueRepositoryPort,
    private readonly dependencies: IssueDependencyRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: AddIssueDependencyRequest): void {
    const { orgId, issueId } = request;
    const issue = this.issues.findById(orgId, issueId);
    if (!issue) {
      throw new IssueNotFoundException(issueId);
    }
    if (request.body.dependsOnIssueId === issueId) {
      throw new IssueValidationException('issue cannot depend on itself');
    }
    const target = this.issues.findById(orgId, request.body.dependsOnIssueId);
    if (!target) {
      throw new IssueNotFoundException(request.body.dependsOnIssueId);
    }
    const type = request.body.type ?? 'blocks';
    if (
      type === 'blocks' &&
      createsBlocksCycle(this.dependencies.listAll(orgId), issueId, target.id)
    ) {
      throw new IssueDependencyCycleException();
    }
    const record: IssueDependencyInsert = {
      orgId,
      issueId,
      dependsOnIssueId: target.id,
      type,
      createdAt: new Date().toISOString(),
    };
    this.dependencies.insert(record);
    this.events.emit(orgId, { type: 'issue', issue });
  }
}
