import { ConflictException, EntityNotFoundException, ValidationException } from '@harnesys/brix';

export class SkillValidationException extends ValidationException {
  constructor(message: string) {
    super(message);
  }
}

export class SkillConflictException extends ConflictException {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}

export class SkillReadOnlyException extends ConflictException {
  constructor(message: string) {
    super(message);
  }
}

export class SkillNotFoundException extends EntityNotFoundException {
  constructor(message: string) {
    super(message);
  }
}
