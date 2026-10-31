import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ApprovalNotFoundException extends EntityNotFoundException {
  constructor(approvalId: string) {
    super(`approval not found: ${approvalId}`, { approvalId });
  }
}

export class PermissionRuleNotFoundException extends EntityNotFoundException {
  constructor(ruleId: string) {
    super(`permission rule not found: ${ruleId}`, { ruleId });
  }
}

export class ApprovalValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}
