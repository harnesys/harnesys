import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class DepartmentNotFoundException extends EntityNotFoundException {
  constructor(departmentId: string) {
    super(`Department not found: ${departmentId}`, { departmentId });
  }
}

export class DepartmentValidationException extends ValidationException {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

export class DepartmentConflictException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}
