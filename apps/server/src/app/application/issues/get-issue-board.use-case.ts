import { Injectable } from '@harnesys/brix';
import type { GetIssueBoardResponse } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueBoardNotFoundException } from '../../domain/issue/issue.error.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface GetIssueBoardRequest {
  orgId: string;
  boardId: string;
}

@Injectable()
export class GetIssueBoardUseCase {
  constructor(private readonly boards: IssueBoardRepositoryPort) {}

  execute(request: GetIssueBoardRequest): GetIssueBoardResponse {
    const board = this.boards.findById(request.orgId, request.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(request.boardId);
    }
    return { board: toBoardPublic(board) };
  }
}
