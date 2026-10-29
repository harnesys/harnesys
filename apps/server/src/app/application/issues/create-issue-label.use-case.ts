import { Injectable } from '@harnesys/brix';
import type { CreateIssueLabelBody, ListIssueLabelsResponse } from '@harnesys/contracts';
import { IssueValidationException } from '../../domain/issue/issue.error.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import type { IssueLabelRecord } from '../../domain/issue/label.ts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { toLabelPublic } from './issue-mappers.ts';
import { resolveLabelColor } from './label-color.ts';

export interface CreateIssueLabelRequest {
  orgId: string;
  body: CreateIssueLabelBody;
}

@Injectable()
export class CreateIssueLabelUseCase {
  constructor(
    private readonly labels: IssueLabelRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: CreateIssueLabelRequest): ListIssueLabelsResponse {
    const title = request.body.title;
    const duplicate = this.labels
      .listByOrg(request.orgId)
      .some((label) => label.title.toLowerCase() === title.toLowerCase());
    if (duplicate) {
      throw new IssueValidationException(`label already exists: ${title}`);
    }
    const color = resolveLabelColor(request.body.color);
    const now = new Date().toISOString();
    const record: IssueLabelRecord = {
      id: crypto.randomUUID(),
      orgId: request.orgId,
      title,
      color,
      createdAt: now,
      updatedAt: now,
    };
    this.labels.insert(record);
    this.events.emit(request.orgId, { type: 'label', label: record });
    return { items: this.labels.listByOrg(request.orgId).map(toLabelPublic) };
  }
}
