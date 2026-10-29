import { Injectable } from '@harnesys/brix';
import type { ListIssueLabelsResponse, UpdateIssueLabelBody } from '@harnesys/contracts';
import {
  IssueLabelNotFoundException,
  IssueValidationException,
} from '../../domain/issue/issue.error.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { IssueLabelPatch } from '../../domain/issue/label.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { toLabelPublic } from './issue-mappers.ts';
import { resolveLabelColor } from './label-color.ts';

export interface UpdateIssueLabelRequest {
  orgId: string;
  labelId: string;
  body: UpdateIssueLabelBody;
}

@Injectable()
export class UpdateIssueLabelUseCase {
  constructor(
    private readonly labels: IssueLabelRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: UpdateIssueLabelRequest): ListIssueLabelsResponse {
    const existing = this.labels.findById(request.orgId, request.labelId);
    if (!existing) {
      throw new IssueLabelNotFoundException(request.labelId);
    }
    const patch: IssueLabelPatch = { updatedAt: new Date().toISOString() };
    if (request.body.title !== undefined) {
      const duplicate = this.labels
        .listByOrg(request.orgId)
        .some(
          (other) =>
            other.id !== request.labelId &&
            other.title.toLowerCase() === request.body.title?.toLowerCase(),
        );
      if (duplicate) {
        throw new IssueValidationException(`label already exists: ${request.body.title}`);
      }
      patch.title = request.body.title;
    }
    if (request.body.color !== undefined) {
      patch.color = resolveLabelColor(request.body.color);
    }
    const label = this.labels.update(request.orgId, request.labelId, patch);
    this.events.emit(request.orgId, { type: 'label', label });
    return { items: this.labels.listByOrg(request.orgId).map(toLabelPublic) };
  }
}
