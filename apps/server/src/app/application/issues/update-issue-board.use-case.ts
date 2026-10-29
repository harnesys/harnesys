import { Injectable } from '@harnesys/brix';
import type { GetIssueBoardResponse, UpdateIssueBoardBody } from '@harnesys/contracts';
import type { IssueBoardPatch } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
} from '../../domain/issue/issue.error.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface UpdateIssueBoardRequest {
  orgId: string;
  boardId: string;
  body: UpdateIssueBoardBody;
}

@Injectable()
export class UpdateIssueBoardUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: UpdateIssueBoardRequest): GetIssueBoardResponse {
    const board = this.boards.findById(request.orgId, request.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(request.boardId);
    }
    if (board.status === 'archived') {
      throw new IssueBoardArchivedException(board.id);
    }
    const patch: IssueBoardPatch = { updatedAt: new Date().toISOString() };
    if (request.body.name !== undefined) {
      patch.name = request.body.name;
    }
    if (request.body.description !== undefined) {
      patch.description = request.body.description;
    }
    if (request.body.color !== undefined) {
      patch.color = request.body.color;
    }
    if (request.body.icon !== undefined) {
      patch.icon = request.body.icon;
    }
    const updated = this.boards.update(request.orgId, board.id, patch);
    this.events.emit(request.orgId, { type: 'board', board: updated });
    return { board: toBoardPublic(updated) };
  }
}
