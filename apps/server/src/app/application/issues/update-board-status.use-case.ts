import { Injectable } from '@harnesys/brix';
import type { BoardStatusInput, GetIssueBoardResponse } from '@harnesys/contracts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { reloadBoardAndEmit } from './board-events.ts';
import { loadEditableBoard } from './board-guards.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface UpdateBoardStatusRequest {
  orgId: string;
  boardId: string;
  statusKey: string;
  input: BoardStatusInput;
}

@Injectable()
export class UpdateBoardStatusUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: UpdateBoardStatusRequest): GetIssueBoardResponse {
    const board = loadEditableBoard(this.boards, request.orgId, request.boardId);
    this.boards.updateStatus(request.orgId, board.id, request.statusKey, request.input);
    const updated = reloadBoardAndEmit(this.boards, this.events, request.orgId, board.id);
    return { board: toBoardPublic(updated) };
  }
}
