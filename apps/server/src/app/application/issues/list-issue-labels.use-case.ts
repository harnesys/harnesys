import { Injectable } from '@harnesys/brix';
import type { ListIssueLabelsResponse } from '@harnesys/contracts';
import { IssueLabelRepositoryPort } from '../../domain/issue/label-repository.port.ts';
import { toLabelPublic } from './issue-mappers.ts';

@Injectable()
export class ListIssueLabelsUseCase {
  constructor(private readonly labels: IssueLabelRepositoryPort) {}

  execute(orgId: string): ListIssueLabelsResponse {
    return { items: this.labels.listByOrg(orgId).map(toLabelPublic) };
  }
}
