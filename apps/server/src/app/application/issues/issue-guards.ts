import type { IssueBoardRecord } from '../../domain/issue/board.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import {
  IssueBoardArchivedException,
  IssueBoardNotFoundException,
  IssueNotFoundException,
} from '../../domain/issue/issue.error.ts';
import type { IssueRecord } from '../../domain/issue/issue.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';

export interface ActiveIssueContext {
  issue: IssueRecord;
  board: IssueBoardRecord;
}

export function loadActiveIssueAndBoard(
  issues: IssueRepositoryPort,
  boards: IssueBoardRepositoryPort,
  orgId: string,
  issueId: string,
): ActiveIssueContext {
  const issue = issues.findById(orgId, issueId);
  if (!issue) {
    throw new IssueNotFoundException(issueId);
  }
  const board: IssueBoardRecord | undefined = boards.findById(orgId, issue.boardId);
  if (!board) {
    throw new IssueBoardNotFoundException(issue.boardId);
  }
  if (board.status === 'archived') {
    throw new IssueBoardArchivedException(board.id);
  }
  return { issue, board };
}

export function loadActiveIssue(
  issues: IssueRepositoryPort,
  boards: IssueBoardRepositoryPort,
  orgId: string,
  issueId: string,
): IssueRecord {
  return loadActiveIssueAndBoard(issues, boards, orgId, issueId).issue;
}
