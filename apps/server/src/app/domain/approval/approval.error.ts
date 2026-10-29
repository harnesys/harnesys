import { EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class ApprovalNotFoundException extends EntityNotFoundException {
  constructor(approvalId: string) {
    super(`approval not found: ${approvalId}`, { approvalId });
  }
}

export class ApprovalValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}
