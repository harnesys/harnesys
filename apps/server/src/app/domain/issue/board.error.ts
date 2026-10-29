import { DomainException } from '@harnesys/brix';
import type { BoardValidationIssue } from './board-validation.ts';

export class BoardValidationException extends DomainException {
  constructor(issues: BoardValidationIssue[]) {
    super('BOARD_VALIDATION', 'Board validation failed', { issues });
  }
}

export class StatusNotEmptyException extends DomainException {
  constructor(statusKey: string, count: number) {
    super('STATUS_NOT_EMPTY', `Status has ${count} issue(s): ${statusKey}`, {
      statusKey,
      count,
    });
  }
}

export class RuleValidationException extends DomainException {
  constructor(message: string, details?: unknown) {
    super('RULE_VALIDATION', message, details);
  }
}
