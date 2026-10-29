import { Injectable } from '@harnesys/brix';
import type { GetIssueBoardResponse } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { reloadBoardAndEmit } from './board-events.ts';
import { loadEditableBoard } from './board-guards.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface ReorderBoardStatusesRequest {
  orgId: string;
  boardId: string;
  order: string[];
}

@Injectable()
export class ReorderBoardStatusesUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: ReorderBoardStatusesRequest): GetIssueBoardResponse {
    const board = loadEditableBoard(this.boards, request.orgId, request.boardId);
    this.boards.reorderStatuses(request.orgId, board.id, request.order);
    const updated = reloadBoardAndEmit(this.boards, this.events, request.orgId, board.id);
    return { board: toBoardPublic(updated) };
  }
}
