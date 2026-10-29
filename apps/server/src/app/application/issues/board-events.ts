import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueBoardNotFoundException } from '../../domain/issue/issue.error.ts';
import { IssueEventsPort } from '../../domain/issue/issue-events.port.ts';

export function reloadBoardAndEmit(
  boards: IssueBoardRepositoryPort,
  events: IssueEventsPort,
  orgId: string,
  boardId: string,
): IssueBoardRecord {
  const board = boards.findById(orgId, boardId);
  if (!board) {
    throw new IssueBoardNotFoundException(boardId);
  }
  events.emit(orgId, { type: 'board', board });
  return board;
}
