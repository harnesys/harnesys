import { Injectable } from '@harnesys/brix';
import type { GetIssueBoardResponse } from '@harnesys/contracts';
import type { IssueBoardPatch } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueBoardNotFoundException } from '../../domain/issue/issue.error.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';
import { toBoardPublic } from './issue-mappers.ts';

export interface SetIssueBoardArchiveRequest {
  orgId: string;
  boardId: string;
  archived: boolean;
}

@Injectable()
export class SetIssueBoardArchiveUseCase {
  constructor(
    private readonly boards: IssueBoardRepositoryPort,
    private readonly events: IssueEventsPort,
  ) {}

  execute(request: SetIssueBoardArchiveRequest): GetIssueBoardResponse {
    const board = this.boards.findById(request.orgId, request.boardId);
    if (!board) {
      throw new IssueBoardNotFoundException(request.boardId);
    }
    const now = new Date().toISOString();
    const patch: IssueBoardPatch = {
      status: request.archived ? 'archived' : 'active',
      archivedAt: request.archived ? (board.archivedAt ?? now) : null,
      updatedAt: now,
    };
    const updated = this.boards.update(request.orgId, board.id, patch);
    this.events.emit(request.orgId, { type: 'board', board: updated });
    return { board: toBoardPublic(updated) };
  }
}
