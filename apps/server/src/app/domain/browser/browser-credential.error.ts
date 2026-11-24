import {
  ConflictException,
  EntityNotFoundException,
  ForbiddenException,
  ValidationException,
} from '@harnesys/brix';

export class BrowserCredentialNotFoundException extends EntityNotFoundException {
  constructor(id: string) {
    super(`Browser credential not found: ${id}`, { id });
  }
}

export class BrowserCredentialValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class BrowserCredentialLockedException extends ForbiddenException {
  constructor(lockedUntil: string | null) {
    super('Browser credential is locked', { lockedUntil });
  }
}

export class AttemptTopologyException extends ConflictException {
  constructor() {
    super('attempt_unsupported_topology');
  }
}

export class AttemptExpiredException extends ValidationException {
  constructor(attemptId: string) {
    super(`Browser login attempt expired: ${attemptId}`, { attemptId });
  }
}

export class AttemptNotFoundException extends EntityNotFoundException {
  constructor(attemptId: string) {
    super(`Browser login attempt not found: ${attemptId}`, { attemptId });
  }
}
