import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ApprovalNotFoundException extends EntityNotFoundException {
  constructor(approvalId: string) {
    super(`approval not found: ${approvalId}`, { approvalId });
  }
}

export class PermissionGrantNotFoundException extends EntityNotFoundException {
  constructor(grantId: string) {
    super(`permission grant not found: ${grantId}`, { grantId });
  }
}

export class ApprovalValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}
