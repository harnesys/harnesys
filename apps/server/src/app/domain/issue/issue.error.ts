import {
  BusinessRuleException,
  ConflictException,
  DomainException,
  EntityNotFoundException,
  ValidationException,
} from '@harnesys/brix';

export class IssueBoardNotFoundException extends EntityNotFoundException {
  constructor(boardId: string) {
    super(
      `Issue board not found: ${boardId} — create the board first (board_create) or pick a boardId from issue_board_list`,
      { boardId },
    );
  }
}

export class IssueNotFoundException extends EntityNotFoundException {
  constructor(issueId: string) {
    super(`Issue not found: ${issueId}`, { issueId });
  }
}

export class IssueLabelNotFoundException extends EntityNotFoundException {
  constructor(labelId: string) {
    super(`Issue label not found: ${labelId}`, { labelId });
  }
}

export class IssueAttachmentNotFoundException extends EntityNotFoundException {
  constructor(attachmentId: string) {
    super(`Issue attachment not found: ${attachmentId}`, { attachmentId });
  }
}

export class InvalidIssueTransitionException extends ConflictException {
  constructor(from: string, to: string) {
    super(`Invalid issue transition: ${from} -> ${to}`, { from, to });
  }
}

export class IssueBoardArchivedException extends ConflictException {
  constructor(boardId: string) {
    super(`Issue board is archived: ${boardId}`, { boardId });
  }
}

export class IssueDependencyCycleException extends BusinessRuleException {
  constructor() {
    super('Issue dependency would create a blocks cycle', { code: 'DEPENDENCY_CYCLE' });
  }
}

export class IssueDepthException extends ValidationException {
  constructor() {
    super('Issue parent already has a parent');
  }
}

export class IssueValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class IssueExecutionActiveException extends ConflictException {
  constructor(issueId: string, executionId: string) {
    super(`Issue already has an active execution: ${issueId}`, { issueId, executionId });
  }
}

export class IssueHandoffBlockedException extends DomainException {
  constructor(issueId: string, reason: string) {
    super('ISSUE_HANDOFF_BLOCKED', reason, { issueId, reason });
  }
}

export class IssueWorktreeBoundException extends ConflictException {
  constructor(issueId: string, worktreeId: string) {
    super(`Issue worktree is bound and cannot be re-linked: ${issueId}`, { issueId, worktreeId });
  }
}
