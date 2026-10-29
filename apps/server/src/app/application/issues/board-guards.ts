import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
} from '../../domain/issue/issue.error.ts';

export function loadEditableBoard(
  boards: IssueBoardRepositoryPort,
  orgId: string,
  boardId: string,
): IssueBoardRecord {
  const board = boards.findById(orgId, boardId);
  if (!board) {
    throw new IssueBoardNotFoundException(boardId);
  }
  if (board.status === 'archived') {
    throw new IssueBoardArchivedException(board.id);
  }
  return board;
}
