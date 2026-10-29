import { Injectable } from '@harnesys/brix';
import { IssueLabelNotFoundException } from '../../domain/issue/issue.error.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';

export interface DeleteIssueLabelRequest {
  orgId: string;
  labelId: string;
}

@Injectable()
export class DeleteIssueLabelUseCase {
  constructor(
    private readonly labels: IssueLabelRepositoryPort,
    private readonly issues: IssueRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: DeleteIssueLabelRequest): void {
    const { orgId, labelId } = request;
    const existing = this.labels.findById(orgId, labelId);
    if (!existing) {
      throw new IssueLabelNotFoundException(labelId);
    }
    this.issues.clearLabelFromAll(orgId, labelId);
    this.labels.delete(orgId, labelId);
    this.events.emit(orgId, { type: 'label-deleted', labelId });
  }
}
