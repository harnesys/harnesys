import { Injectable } from '@harnesys/brix';
import type { ListIssueBoardsResponse } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { toBoardPublic } from './issue-mappers.ts';

@Injectable()
export class ListIssueBoardsUseCase {
  constructor(private readonly boards: IssueBoardRepositoryPort) {}

  execute(orgId: string): ListIssueBoardsResponse {
    return {
      items: this.boards.listByOrg(orgId).map(toBoardPublic),
    };
  }
}
