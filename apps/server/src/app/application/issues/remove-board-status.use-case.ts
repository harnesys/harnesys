import { Injectable } from '@harnesys/brix';
import type { GetIssueBoardResponse } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { reloadBoardAndEmit } from './board-events.ts';
import { loadEditableBoard } from './board-guards.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface RemoveBoardStatusRequest {
  orgId: string;
  boardId: string;
  statusKey: string;
}

@Injectable()
export class RemoveBoardStatusUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: RemoveBoardStatusRequest): GetIssueBoardResponse {
    const board = loadEditableBoard(this.boards, request.orgId, request.boardId);
    this.boards.removeStatus(request.orgId, board.id, request.statusKey);
    const updated = reloadBoardAndEmit(this.boards, this.events, request.orgId, board.id);
    return { board: toBoardPublic(updated) };
  }
}
